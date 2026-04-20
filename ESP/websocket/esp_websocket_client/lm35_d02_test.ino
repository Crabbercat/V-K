// ESP32 LM35 quick test on D02 (GPIO2)
// This sketch only reads temperature and prints to Serial.
// No WiFi/WebSocket is used.

#include <Arduino.h>

const uint8_t TEMP_SENSOR_PIN = 2;   // D02 on many ESP32 boards
const uint32_t READ_INTERVAL_MS = 1000;

unsigned long lastReadMs = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);
  analogSetPinAttenuation(TEMP_SENSOR_PIN, ADC_11db);

  Serial.println("=== LM35 D02 test (ESP32) ===");
  Serial.println("Pin: GPIO2 (D02)");
  Serial.println("Formula: Temperature(C) = mV / 10");
}

void loop() {
  if (millis() - lastReadMs < READ_INTERVAL_MS) {
    return;
  }
  lastReadMs = millis();

  uint16_t raw = analogRead(TEMP_SENSOR_PIN);
  uint32_t milliVolts = analogReadMilliVolts(TEMP_SENSOR_PIN);
  float temperatureC = milliVolts / 10.0f;

  Serial.printf("raw=%u, mV=%lu, temp=%.2f C\n", raw, milliVolts, temperatureC);
}
