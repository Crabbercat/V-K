# ESP32 IoT Plant Monitor - Component Test Files

Individual test sketches for each component. Upload one test file at a time to validate hardware.

## Pin Configuration

| Component | GPIO | File | Test Interval |
|-----------|------|------|---|
| LM35 Temperature Sensor | GPIO5 (D5) | `lm35_temp_test.ino` | 1 second |
| Soil Moisture Sensor | GPIO18 (D18) | `soil_moisture_test.ino` | 1 second |
| Servo (Water Valve) | GPIO13 (D13) | `servo_valve_test.ino` | 3 seconds toggle |
| Heater LED | GPIO14 (D14) | `heater_light_test.ino` | 2 seconds toggle |

## How to Use

1. **Temperature Sensor Test**
   - Upload: `lm35_temp_test.ino`
   - Open Serial Monitor (115200 baud)
   - Should see: `raw | mV | Temperature(°C)`
   - Normal readings: ~140-300 mV (14-30°C)

2. **Soil Moisture Test**
   - Upload: `soil_moisture_test.ino`
   - Open Serial Monitor (115200 baud)
   - Should see: `Soil: XXXX | STATE`
   - Dry soil (air): ~1000-2000
   - Wet soil (water): ~3000-4095

3. **Servo Motor Test**
   - Upload: `servo_valve_test.ino`
   - Open Serial Monitor (115200 baud)
   - Servo should toggle between closed (0°) and open (90°) every 3 seconds
   - Listen for servo clicks/movement

4. **Heater LED Test**
   - Upload: `heater_light_test.ino`
   - Open Serial Monitor (115200 baud)
   - LED on GPIO14 should toggle on/off every 2 seconds
   - Check LED brightness or use multimeter

## Thresholds (from main sketch)

- **Soil Moisture**: 
  - DRY: < 2000 (open water valve)
  - WET: > 3000 (close water valve)

- **Temperature**: 
  - Formula: °C = mV / 10
  - LM35: 0.01V per °C

## Next Steps

After testing all components individually:
1. Verify all sensors are reading correctly
2. Confirm servo moves smoothly
3. Check LED brightness
4. Upload main sketch: `esp_http_client.ino`
