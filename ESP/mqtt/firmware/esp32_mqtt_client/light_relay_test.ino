// ESP32 LED PWM Test
// Pin: GPIO27 (PWM output)
// Use an LED, LED strip, or a MOSFET/driver stage.
// This LED is used to simulate both lighting and heating in the test setup.

#include <Arduino.h>

const uint8_t LIGHT_PWM_PIN = 27;
const uint32_t TOGGLE_INTERVAL_MS = 2000;

unsigned long lastToggleMs = 0;
uint8_t level = 0;
bool increasing = true;

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LIGHT_PWM_PIN, OUTPUT);
  // LEDC channel 0, 8-bit resolution, 1kHz
  ledcSetup(0, 1000, 8);
  ledcAttachPin(LIGHT_PWM_PIN, 0);

  Serial.println("=== LED PWM Test (GPIO27) ===");
  Serial.println("Ramping brightness up/down every 2 seconds...");
}

void loop() {
  if (millis() - lastToggleMs < TOGGLE_INTERVAL_MS) {
    return;
  }
  lastToggleMs = millis();

  if (increasing) {
    level = min(255, level + 51);
    if (level == 255) increasing = false;
  } else {
    level = max(0, level - 51);
    if (level == 0) increasing = true;
  }

  ledcWrite(0, level);
  Serial.printf("LED PWM level: %u/255\n", level);
}
