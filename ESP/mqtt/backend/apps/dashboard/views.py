import json
from datetime import datetime, timedelta, timezone

from django.http import HttpRequest, HttpResponseBadRequest, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from pymongo import DESCENDING

from config.mongo import get_db
from mqtt_service.mqtt_publishers import publish_device_command


def index(request: HttpRequest):
    return render(request, "dashboard/index.html")


def _period_start(period: str) -> datetime:
    now = datetime.now(timezone.utc)
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

    payload = {
        "deviceId": device_id,
        "temperature": latest.get("temperature"),
        "soilMoisture": latest.get("soilMoisture"),
        "pump": status.get("pump", False),
        "light": status.get("light", False),
        "heater": status.get("heater", False),
        "timestamp": latest.get("timestamp") or status.get("timestamp"),
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

    rows = [
        {
            "timestamp": item["timestamp"].isoformat(),
            "temperature": item.get("temperature"),
            "soilMoisture": item.get("soilMoisture"),
        }
        for item in cursor
    ]
    return JsonResponse({"deviceId": device_id, "period": period, "items": rows})


def api_events(request: HttpRequest):
    db = get_db()
    device_id = request.GET.get("deviceId", "esp32-001")

    rows = list(
        db.commands.find({"deviceId": device_id})
        .sort("timestamp", DESCENDING)
        .limit(20)
    )
    payload = [
        {
            "timestamp": item["timestamp"].isoformat(),
            "pump": item.get("pump", False),
            "light": item.get("light", False),
            "heater": item.get("heater", False),
            "source": item.get("source", "unknown"),
        }
        for item in rows
    ]
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
    command = {
        "pump": bool(body.get("pump", False)),
        "light": bool(body.get("light", False)),
        "heater": bool(body.get("heater", False)),
    }

    publish_device_command(device_id, command)

    db = get_db()
    db.commands.insert_one(
        {
            "deviceId": device_id,
            **command,
            "source": "dashboard",
            "timestamp": datetime.now(timezone.utc),
        }
    )

    return JsonResponse({"status": "queued", "deviceId": device_id, "command": command})
