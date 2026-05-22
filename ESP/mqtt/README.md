# Smart Plant Monitoring - MQTT Migration

This project implements the migration from HTTP polling to MQTT pub/sub architecture based on `ESP/spec_ck.txt`.

## Structure

- `backend/`: Django backend + MQTT subscriber + MongoDB storage + dashboard
- `firmware/`: ESP32 firmware using MQTT + relay outputs (pump/light/heater)
- `docker-compose.yml`: Django + MongoDB + Mosquitto stack
- `docker/mosquitto/mosquitto.conf`: Mosquitto broker config

## Hardware Mapping (Spec)

- Soil moisture: GPIO34
- Temperature (LM35): GPIO35
- Water pump relay: GPIO26
- Lighting relay: GPIO27
- Heating relay: GPIO25

## MQTT Topics

- Telemetry publish: `plant/device/{deviceId}/telemetry`
- Status publish: `plant/device/{deviceId}/status`
- Command subscribe: `plant/device/{deviceId}/command`

## Backend Capabilities

- Device registration (`devices` collection)
- Telemetry storage (`telemetry` collection)
- Commands log (`commands` collection)
- Events (`events` collection)
- Live dashboard (cards + chart + timeline)
- Server-side automation:
  - soil below threshold => pump ON
  - temp below threshold => heater ON

## Run with Docker

```bash
docker compose up --build
```

Dashboard: `http://localhost:8000`

## Run backend locally (without Docker)

```bash
cd backend
python -m pip install -r requirements.txt
python manage.py runserver 0.0.0.0:8000
```

## Firmware notes

Open `firmware/esp32_mqtt_client/esp32_mqtt_client.ino` and update:

- `WIFI_SSID`
- `WIFI_PASS`
- `MQTT_HOST`
- `DEVICE_ID`

Then upload to ESP32 using Arduino IDE.

## Fake Data Script (3s sampling)

If you want to test dashboard/backend without real ESP32, run fake MQTT publisher:

```bash
python tools/fake_device_publisher.py --host localhost --port 1883 --device-id esp32-001 --interval 3
```

This script publishes to:

- `plant/device/{deviceId}/telemetry`
- `plant/device/{deviceId}/status`
