// ESP32 Heater Relay Test
// Pin: GPIO25
// Toggles ON/OFF every 2 seconds

#include <Arduino.h>

const uint8_t HEATER_RELAY_PIN = 25;
const uint32_t TOGGLE_INTERVAL_MS = 2000;

unsigned long lastToggleMs = 0;
bool heaterOn = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(HEATER_RELAY_PIN, OUTPUT);
  digitalWrite(HEATER_RELAY_PIN, LOW);

  Serial.println("=== Heater Relay Test (GPIO25) ===");
  Serial.println("Toggling ON/OFF every 2 seconds...");
}

void loop() {
  if (millis() - lastToggleMs < TOGGLE_INTERVAL_MS) {
    return;
  }
  lastToggleMs = millis();

  heaterOn = !heaterOn;
  digitalWrite(HEATER_RELAY_PIN, heaterOn ? HIGH : LOW);
  Serial.printf("Heater: %s\n", heaterOn ? "ON" : "OFF");
}
