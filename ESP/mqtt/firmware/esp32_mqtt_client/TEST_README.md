# ESP32 MQTT Hardware Test Files

Component-level test sketches for the MQTT hardware mapping. Upload one test at a time.

## Pin Mapping (MQTT version)

- Pump relay: GPIO26
- Light relay: GPIO27
- Heater relay: GPIO25
- LM35 temperature: GPIO35
- Soil moisture (YL-69): GPIO34
- Light sensor (photoresistor / LDR): GPIO36

## Files

- `pump_relay_test.ino`
- `light_relay_test.ino`
- `heater_relay_test.ino`
- `lm35_temp_test.ino`
- `soil_moisture_test.ino`
- `offline_test.ino`

## How to test

1. Upload `pump_relay_test.ino`
- Verify relay on GPIO26 toggles every 2 seconds.

2. Upload `light_relay_test.ino`
- Verify relay on GPIO27 toggles every 2 seconds.

3. Upload `heater_relay_test.ino`
- Verify relay on GPIO25 toggles every 2 seconds.

4. Upload `lm35_temp_test.ino`
- Open Serial Monitor at 115200 baud.
- Expected format: `raw | mV | tempC`.

5. Upload `soil_moisture_test.ino`
- Open Serial Monitor at 115200 baud.
- Expected format: `raw | percent | zone`.
- Adjust `SOIL_ADC_DRY` and `SOIL_ADC_WET` for your sensor calibration.

6. Upload `light_sensor_test.ino` or the main MQTT firmware to verify the photoresistor input on GPIO36.

7. Upload `esp32_mqtt_client.ino`
- Pump relay automatically turns off after 2 seconds for both manual and automation commands.
- Telemetry now includes `lightIntensity` from the photoresistor.

8. Upload `offline_test.ino`
- Open Serial Monitor at 115200 baud.
- Use keyboard commands:
  - `p`: toggle pump
  - `l`: toggle light
  - `h`: toggle heater
  - `s`: print sensor values
  - `m`: print menu
