import json
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from django.http import HttpRequest, HttpResponseBadRequest, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from pymongo import DESCENDING

from config.mongo import get_db
from mqtt_service.mqtt_publishers import publish_device_command

logger = logging.getLogger(__name__)


def index(request: HttpRequest):
    return render(request, "dashboard/index.html")


def _period_start(period: str) -> datetime:
    now = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    if period == "hour":
        return now - timedelta(hours=1)
    if period == "week":
        return now - timedelta(days=7)
    return now - timedelta(days=1)


def api_overview(request: HttpRequest):
    db = get_db()
    device_id = request.GET.get("deviceId", "esp32-001")

    latest = db.telemetry.find_one({"deviceId": device_id}, sort=[("timestamp", DESCENDING)]) or {}
    status = db.device_status.find_one({"deviceId": device_id}) or {}
    # Normalize timestamp to Asia/Ho_Chi_Minh and return ISO string
    ts = latest.get("timestamp") or status.get("timestamp")
    if ts is not None:
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        ts = ts.astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).isoformat()

    payload = {
        "deviceId": device_id,
        "temperature": latest.get("temperature"),
        "soilMoisture": latest.get("soilMoisture"),
        "lightIntensity": latest.get("lightIntensity"),
        "pump": status.get("pump", False),
        "light": status.get("light", False),
        "timestamp": ts,
    }
    return JsonResponse(payload)


def api_history(request: HttpRequest):
    db = get_db()
    device_id = request.GET.get("deviceId", "esp32-001")
    period = request.GET.get("period", "day")
    start = _period_start(period)

    cursor = (
        db.telemetry.find({"deviceId": device_id, "timestamp": {"$gte": start}})
        .sort("timestamp", 1)
        .limit(5000)
    )

    rows = []
    for item in cursor:
        ts = item["timestamp"]
        if ts is not None:
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            ts = ts.astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).isoformat()

        rows.append({
            "timestamp": ts,
            "temperature": item.get("temperature"),
            "soilMoisture": item.get("soilMoisture"),
            "lightIntensity": item.get("lightIntensity"),
        })
    return JsonResponse({"deviceId": device_id, "period": period, "items": rows})


def api_events(request: HttpRequest):
    db = get_db()
    device_id = request.GET.get("deviceId", "esp32-001")

    rows = list(db.commands.find({"deviceId": device_id}).sort("timestamp", DESCENDING).limit(20))
    payload = []
    for item in rows:
        ts = item.get("timestamp")
        if ts is not None:
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            ts = ts.astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).isoformat()

        payload.append({
            "timestamp": ts,
            "pump": item.get("pump", False),
            "light": item.get("light", False),
            "source": item.get("source", "unknown"),
        })
    return JsonResponse({"deviceId": device_id, "items": payload})


@csrf_exempt
def api_command(request: HttpRequest):
    if request.method != "POST":
        return HttpResponseBadRequest("POST required")

    try:
        body = json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return HttpResponseBadRequest("Invalid JSON")

    device_id = body.get("deviceId", "esp32-001")

    # Build command from only the fields the client sent.
    command = {}
    if "pump" in body:
        command["pump"] = bool(body["pump"])
    if "light" in body:
        command["light"] = bool(body["light"])

    if not command:
        return HttpResponseBadRequest("No actuator field provided")

    db = get_db()
    now = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))

    # ── 1. Update only the provided fields in device_status.
    db.device_status.update_one(
        {"deviceId": device_id},
        {
            "$set": {
                "deviceId": device_id,
                **command,
                "timestamp": now,
            }
        },
        upsert=True,
    )

    # ── 2. Record in command history.
    db.commands.insert_one(
        {
            "deviceId": device_id,
            **command,
            "source": "dashboard",
            "timestamp": now,
        }
    )

    # ── 3. Publish full actuator state to MQTT so the device knows both.
    status = db.device_status.find_one({"deviceId": device_id}) or {}
    mqtt_payload = {
        "pump": status.get("pump", False),
        "light": status.get("light", False),
    }
    try:
        publish_device_command(device_id, mqtt_payload)
    except Exception:
        logger.exception("MQTT publish failed for %s", device_id)

    return JsonResponse({"status": "queued", "deviceId": device_id, "command": command})
