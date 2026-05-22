from datetime import datetime, timezone

from django.conf import settings

from config.mongo import get_db


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
        "heater": bool(payload.get("heater", False)),
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

    if temp < settings.AUTOMATION_TEMP_THRESHOLD:
        command["heater"] = True
    else:
        command["heater"] = False

    # Keep light as current state if available; otherwise default off.
    status = db.device_status.find_one({"deviceId": device_id}) or {}
    command["light"] = bool(status.get("light", False))

    publish_device_command(device_id, command)
    db.commands.insert_one(
        {
            "deviceId": device_id,
            "pump": command["pump"],
            "heater": command["heater"],
            "light": command["light"],
            "source": "automation",
            "timestamp": _now(),
        }
    )

    if events:
        db.events.insert_many(events)
