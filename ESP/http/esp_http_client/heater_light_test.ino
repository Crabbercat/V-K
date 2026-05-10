// ESP32 Heater LED Test
// Pin: GPIO14 (D14)
// Toggles on/off every 2 seconds

#include <Arduino.h>

const int LED_HEATER_PIN = 14;  // GPIO14
const uint32_t TOGGLE_INTERVAL_MS = 2000;

unsigned long lastToggleMs = 0;
bool heaterOn = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_HEATER_PIN, OUTPUT);
  digitalWrite(LED_HEATER_PIN, LOW);
  heaterOn = false;

  Serial.println("=== Heater LED Test (GPIO14) ===");
  Serial.println("Toggling on/off every 2 seconds...");
  Serial.println();
}

void loop() {
  if (millis() - lastToggleMs < TOGGLE_INTERVAL_MS) {
    return;
  }
  lastToggleMs = millis();

  if (heaterOn) {
    digitalWrite(LED_HEATER_PIN, LOW);
    Serial.println("Heater: OFF");
    heaterOn = false;
  } else {
    digitalWrite(LED_HEATER_PIN, HIGH);
    Serial.println("Heater: ON");
    heaterOn = true;
  }
}
