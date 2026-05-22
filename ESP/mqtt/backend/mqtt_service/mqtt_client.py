import json
import threading

import paho.mqtt.client as mqtt
from django.conf import settings

from config.mongo import ensure_indexes
from mqtt_service.mqtt_handlers import handle_status, handle_telemetry

_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
_started = False
_lock = threading.Lock()


def _on_connect(client, _userdata, _flags, reason_code, _properties):
    if reason_code == 0:
        client.subscribe(settings.MQTT_TOPIC_TELEMETRY, qos=1)
        client.subscribe(settings.MQTT_TOPIC_STATUS, qos=1)


def _on_message(_client, _userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return

    if msg.topic.endswith("/telemetry"):
        handle_telemetry(msg.topic, payload)
    elif msg.topic.endswith("/status"):
        handle_status(msg.topic, payload)


def get_client() -> mqtt.Client:
    return _client


def start_mqtt_listener() -> None:
    global _started
    with _lock:
        if _started:
            return
        ensure_indexes()
        _client.on_connect = _on_connect
        _client.on_message = _on_message
        _client.connect(settings.MQTT_HOST, settings.MQTT_PORT, 60)
        _client.loop_start()
        _started = True
