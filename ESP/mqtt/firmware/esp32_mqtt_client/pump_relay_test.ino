// ESP32 Water Pump Relay Test
// Pin: GPIO26
// Toggles ON/OFF every 2 seconds

#include <Arduino.h>

const uint8_t PUMP_RELAY_PIN = 26;
const uint32_t TOGGLE_INTERVAL_MS = 2000;

unsigned long lastToggleMs = 0;
bool pumpOn = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(PUMP_RELAY_PIN, OUTPUT);
  digitalWrite(PUMP_RELAY_PIN, LOW);

  Serial.println("=== Pump Relay Test (GPIO26) ===");
  Serial.println("Toggling ON/OFF every 2 seconds...");
}

void loop() {
  if (millis() - lastToggleMs < TOGGLE_INTERVAL_MS) {
    return;
  }
  lastToggleMs = millis();

  pumpOn = !pumpOn;
  digitalWrite(PUMP_RELAY_PIN, pumpOn ? HIGH : LOW);
  Serial.printf("Pump: %s\n", pumpOn ? "ON" : "OFF");
}
