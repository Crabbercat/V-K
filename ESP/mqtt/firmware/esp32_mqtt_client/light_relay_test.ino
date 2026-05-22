// ESP32 Light Relay Test
// Pin: GPIO27
// Toggles ON/OFF every 2 seconds

#include <Arduino.h>

const uint8_t LIGHT_RELAY_PIN = 27;
const uint32_t TOGGLE_INTERVAL_MS = 2000;

unsigned long lastToggleMs = 0;
bool lightOn = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LIGHT_RELAY_PIN, OUTPUT);
  digitalWrite(LIGHT_RELAY_PIN, LOW);

  Serial.println("=== Light Relay Test (GPIO27) ===");
  Serial.println("Toggling ON/OFF every 2 seconds...");
}

void loop() {
  if (millis() - lastToggleMs < TOGGLE_INTERVAL_MS) {
    return;
  }
  lastToggleMs = millis();

  lightOn = !lightOn;
  digitalWrite(LIGHT_RELAY_PIN, lightOn ? HIGH : LOW);
  Serial.printf("Light: %s\n", lightOn ? "ON" : "OFF");
}
