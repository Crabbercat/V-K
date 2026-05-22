# ESP32 MQTT Firmware

Firmware refactored from the HTTP version (`ESP/http/esp_http_client`) to MQTT + relay output architecture.

## Hardware Mapping
- Soil sensor: GPIO34
- Temperature (LM35): GPIO35
- Pump relay: GPIO26
- Light relay: GPIO27
- Heater relay: GPIO25

## Arduino Libraries
- `PubSubClient`
- `ArduinoJson` (v6)

## Upload Steps
1. Open `esp32_mqtt_client/esp32_mqtt_client.ino`.
2. Update `WIFI_SSID`, `WIFI_PASS`, `MQTT_HOST`, `DEVICE_ID`.
3. Calibrate `SOIL_ADC_DRY` and `SOIL_ADC_WET` to match your YL-69 readings.
4. Install required libraries in Arduino IDE.
5. Select ESP32 board and upload.

## Topics
- Publish telemetry: `plant/device/{deviceId}/telemetry` (every 30s)
- Publish status: `plant/device/{deviceId}/status` (every 60s + on command apply)
- Subscribe command: `plant/device/{deviceId}/command`

## Hardware Tests

Test sketches are in `esp32_mqtt_client/`:

- `mqtt_fake_telemetry_test.ino`
- `pump_relay_test.ino`
- `light_relay_test.ino`
- `heater_relay_test.ino`
- `lm35_temp_test.ino`
- `soil_moisture_test.ino`
- `offline_test.ino`

See `esp32_mqtt_client/TEST_README.md` for step-by-step testing.
