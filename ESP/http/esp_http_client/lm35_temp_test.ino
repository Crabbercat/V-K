// ESP32 LM35 Temperature Sensor Test
// Pin: GPIO5 (D5)
// Formula: Temperature(°C) = mV / 10

#include <Arduino.h>

const uint8_t TEMP_SENSOR_PIN = 5;  // GPIO5 - LM35 sensor
const uint32_t READ_INTERVAL_MS = 1000;

unsigned long lastReadMs = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);
  analogSetPinAttenuation(TEMP_SENSOR_PIN, ADC_11db);

  Serial.println("=== LM35 Temperature Sensor Test (GPIO5) ===");
  Serial.println("Reading every 1 second...");
  Serial.println("Format: raw | mV | Temperature(°C)");
}

void loop() {
  if (millis() - lastReadMs < READ_INTERVAL_MS) {
    return;
  }
  lastReadMs = millis();

  uint16_t raw = analogRead(TEMP_SENSOR_PIN);
  uint32_t milliVolts = analogReadMilliVolts(TEMP_SENSOR_PIN);
  float temperatureC = milliVolts / 10.0f;

  Serial.printf("%u | %lu mV | %.2f °C\n", raw, milliVolts, temperatureC);
}
