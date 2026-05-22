// ESP32 Photoresistor (LDR) Test
// Pin: GPIO36 (ADC1)
// Circuit: LDR + fixed resistor as a voltage divider

#include <Arduino.h>

const uint8_t LDR_PIN = 36;  // GPIO36 - ADC1 input only
const uint32_t READ_INTERVAL_MS = 1000;

unsigned long lastReadMs = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);
  analogSetPinAttenuation(LDR_PIN, ADC_11db);

  Serial.println("=== Quang tro / LDR Test (GPIO36) ===");
  Serial.println("Reading every 1 second...");
  Serial.println("Format: raw | mV | brightness%");
  Serial.println("Note: lower raw usually means darker, higher raw means brighter");
}

void loop() {
  if (millis() - lastReadMs < READ_INTERVAL_MS) {
    return;
  }
  lastReadMs = millis();

  uint16_t raw = analogRead(LDR_PIN);
  uint32_t milliVolts = analogReadMilliVolts(LDR_PIN);

  uint8_t brightnessPercent = map(raw, 0, 4095, 0, 100);

  const char *state;
  if (brightnessPercent < 30) {
    state = "DARK";
  } else if (brightnessPercent < 70) {
    state = "NORMAL";
  } else {
    state = "BRIGHT";
  }

  Serial.printf("raw=%u | %lu mV | %u%% | %s\n", raw, milliVolts, brightnessPercent, state);
}