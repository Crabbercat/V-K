from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from django.conf import settings

from config.mongo import get_db


def _now() -> datetime:
    return datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))


def _extract_device_id(topic: str) -> str:
    parts = topic.split("/")
    if len(parts) < 4:
        return "unknown"
    return parts[2]


def handle_status(topic: str, payload: dict) -> None:
    db = get_db()
    device_id = payload.get("deviceId") or _extract_device_id(topic)

    device_doc = {
        "deviceId": device_id,
        "name": payload.get("name", device_id),
        "lastSeen": _now(),
    }
    db.devices.update_one(
        {"deviceId": device_id},
        {"$set": device_doc, "$setOnInsert": {"createdAt": _now()}},
        upsert=True,
    )

    status = {
        "deviceId": device_id,
        "online": bool(payload.get("online", True)),
        "pump": bool(payload.get("pump", False)),
        "light": bool(payload.get("light", False)),
        "timestamp": _now(),
    }
    db.device_status.update_one({"deviceId": device_id}, {"$set": status}, upsert=True)


def handle_telemetry(topic: str, payload: dict) -> None:
    db = get_db()
    device_id = payload.get("deviceId") or _extract_device_id(topic)

    telemetry = {
        "deviceId": device_id,
        "temperature": float(payload.get("temperature", 0)),
        "soilMoisture": int(payload.get("soilMoisture", 0)),
        "lightIntensity": float(payload.get("lightIntensity", 0)),
        "timestamp": _now(),
    }
    db.telemetry.insert_one(telemetry)

    db.devices.update_one(
        {"deviceId": device_id},
        {"$set": {"lastSeen": _now()}, "$setOnInsert": {"name": device_id, "createdAt": _now()}},
        upsert=True,
    )

    process_automation_rule(device_id, telemetry)


def process_automation_rule(device_id: str, telemetry: dict) -> None:
    from mqtt_service.mqtt_publishers import publish_device_command

    db = get_db()
    soil = telemetry["soilMoisture"]
    temp = telemetry["temperature"]

    command = {}
    events = []

    if soil < settings.AUTOMATION_SOIL_THRESHOLD:
        command["pump"] = True
        events.append({
            "deviceId": device_id,
            "type": "LOW_SOIL_MOISTURE",
            "message": f"Soil moisture below threshold ({soil} < {settings.AUTOMATION_SOIL_THRESHOLD})",
            "timestamp": _now(),
        })
    else:
        command["pump"] = False

    # Light also provides heating — force ON when temperature is low.
    status = db.device_status.find_one({"deviceId": device_id}) or {}
    if temp < settings.AUTOMATION_TEMP_THRESHOLD:
        command["light"] = True
    else:
        command["light"] = bool(status.get("light", False))

    publish_device_command(device_id, command)
    db.commands.insert_one(
        {
            "deviceId": device_id,
            "pump": command["pump"],
            "light": command["light"],
            "source": "automation",
            "timestamp": _now(),
        }
    )

    if events:
        db.events.insert_many(events)
