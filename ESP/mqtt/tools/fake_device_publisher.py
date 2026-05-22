import argparse
import json
import random
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import paho.mqtt.client as mqtt


def now_iso() -> str:
    return datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).isoformat()


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish fake plant telemetry to MQTT broker")
    parser.add_argument("--host", default="localhost", help="MQTT broker host")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--device-id", default="esp32-001", help="Device ID")
    parser.add_argument("--interval", type=float, default=3.0, help="Sample interval in seconds")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducible data")
    args = parser.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    device_id = args.device_id
    topic_telemetry = f"plant/device/{device_id}/telemetry"
    topic_status = f"plant/device/{device_id}/status"

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"fake-{device_id}")
    client.connect(args.host, args.port, 60)
    client.loop_start()

    temp = 27.0
    soil = 62.0
    lux = 800.0
    pump = False
    light = True
    tick = 0

    print(f"Publishing fake data to {args.host}:{args.port} every {args.interval}s")
    print(f"Telemetry topic: {topic_telemetry}")
    print(f"Status topic:    {topic_status}")

    try:
        while True:
            # Random-walk values to look like real sensor stream.
            temp = clamp(temp + random.uniform(-0.35, 0.35), 16.0, 36.0)
            soil = clamp(soil + random.uniform(-1.8, 1.0), 5.0, 95.0)

            # Simple simulated behavior:
            # - If too dry, pump turns on and soil rises quickly.
            # - If too cold, heater turns on.
            pump = soil < 30
            if temp < 18:
                light = True

            if pump:
                soil = clamp(soil + random.uniform(3.0, 5.0), 0.0, 100.0)
            else:
                soil = clamp(soil - random.uniform(0.2, 0.7), 0.0, 100.0)

            # Light toggles every 20 samples for variety.
            if tick % 20 == 0:
                light = not light

            # Light intensity depends on grow light state.
            if light:
                lux = clamp(lux + random.uniform(-30, 30), 600.0, 1200.0)
            else:
                lux = clamp(lux + random.uniform(-10, 10), 50.0, 180.0)
                # Quickly drop when light just turned off.
                if lux > 200:
                    lux = random.uniform(80.0, 160.0)

            telemetry_payload = {
                "deviceId": device_id,
                "temperature": round(temp, 2),
                "soilMoisture": int(round(soil)),
                "lightIntensity": round(lux, 1),
                "timestamp": now_iso(),
            }

            status_payload = {
                "deviceId": device_id,
                "online": True,
                "pump": pump,
                "light": light,
                "timestamp": now_iso(),
            }

            client.publish(topic_telemetry, json.dumps(telemetry_payload), qos=1)
            client.publish(topic_status, json.dumps(status_payload), qos=1, retain=True)

            print(
                f"[{now_iso()}] temp={telemetry_payload['temperature']}C "
                f"soil={telemetry_payload['soilMoisture']}% "
                f"lux={telemetry_payload['lightIntensity']} pump={pump} light={light}"
            )

            tick += 1
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped publisher")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
