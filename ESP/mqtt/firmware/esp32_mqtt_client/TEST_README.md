# ESP32 MQTT Hardware Test Files

Component-level test sketches for the MQTT hardware mapping. Upload one test at a time.

## Pin Mapping (MQTT version)

- Pump relay: GPIO26 (relay module — switch pump power through relay contacts)
- Light PWM output / LED: GPIO27 — LED is used to simulate both lighting and heating
- LM35 temperature (analog): GPIO35
- Soil moisture (YL-69, analog): GPIO34
- Photoresistor (LDR, analog): GPIO32

## Files

- `mqtt_fake_telemetry_test.ino`
- `pump_relay_test.ino`
- `light_relay_test.ino` (PWM-based LED/light test)
- `lm35_temp_test.ino`
- `soil_moisture_test.ino`
- `offline_test.ino`

## How to test

1. Upload `mqtt_fake_telemetry_test.ino`
- Verify the board connects to WiFi and MQTT.
- Check the broker/server logs for telemetry on `plant/device/esp32-001/telemetry`.
- The payload is fake data only, so no sensors are required.

2. Upload `pump_relay_test.ino`
- Verify relay on GPIO26 toggles every 2 seconds.

3. Upload `light_relay_test.ino`
- This sketch outputs PWM on GPIO27 and ramps brightness. Connect it to a LED/driver/MOSFET.
- The same LED can be used to simulate both lighting and heating status in tests.

4. Upload `lm35_temp_test.ino`
- Open Serial Monitor at 115200 baud.
- Expected format: `raw | mV | tempC`.

5. Upload `soil_moisture_test.ino`
- Open Serial Monitor at 115200 baud.
- Expected format: `raw | percent | zone`.
- Adjust `SOIL_ADC_DRY` and `SOIL_ADC_WET` for your sensor calibration.

6. Upload `offline_test.ino` (if present)
- Open Serial Monitor at 115200 baud.
- Use keyboard commands (if implemented):
  - `p`: toggle pump
  - `l`: toggle LED light
  - `s`: print sensor values
  - `m`: print menu

## Wiring notes & safety
- Relay modules: wire pump power through the relay common/NO or NC contacts. Keep wiring isolated and follow safety precautions.
- Light control: use an LED or LED driver/MOSFET on GPIO27. The ESP32 PWM pin only provides logic-level control.
- Analog sensors: LM35 and YL-69 should be connected to the ESP32 ADC pins listed above. Calibrate `SOIL_ADC_DRY` and `SOIL_ADC_WET` for your sensor.

## Next step

After all tests pass, upload main firmware:
- `esp32_mqtt_client.ino`
