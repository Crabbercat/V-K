import json

from .mqtt_client import get_client


def command_topic(device_id: str) -> str:
    return f"plant/device/{device_id}/command"


def publish_device_command(device_id: str, payload: dict) -> None:
    client = get_client()
    topic = command_topic(device_id)
    client.publish(topic, json.dumps(payload), qos=1)
