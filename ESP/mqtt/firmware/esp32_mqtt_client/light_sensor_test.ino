// ESP32 Photoresistor / LDR Test
// Pin: GPIO36 (ADC1)
// Circuit: LDR + resistor voltage divider

#include <Arduino.h>

const uint8_t LIGHT_PIN = 36;  // GPIO36 - ADC1 input only
const uint32_t READ_INTERVAL_MS = 1000;
const float LIGHT_LUX_MAX = 2000.0f;

unsigned long lastReadMs = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);
  analogSetPinAttenuation(LIGHT_PIN, ADC_11db);

  Serial.println("=== LDR Light Sensor Test (GPIO36) ===");
  Serial.println("Reading every 1 second...");
  Serial.println("Format: raw | estimated lux | brightness%");
}

void loop() {
  if (millis() - lastReadMs < READ_INTERVAL_MS) {
    return;
  }
  lastReadMs = millis();

  uint16_t raw = analogRead(LIGHT_PIN);
  float lux = (float)raw * LIGHT_LUX_MAX / 4095.0f;
  uint8_t brightnessPercent = map(raw, 0, 4095, 0, 100);

  Serial.printf("raw=%u | %.1f lux | %u%%\n", raw, lux, brightnessPercent);
}
