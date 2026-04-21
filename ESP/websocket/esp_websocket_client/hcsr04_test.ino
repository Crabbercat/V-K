// ESP32 + HC-SR04 basic connection test
// Purpose: verify HC-SR04 wiring and distance reading on Serial Monitor.

#include <Arduino.h>

const uint8_t TRIG_PIN = 5;   // Change if needed
const uint8_t ECHO_PIN = 18;  // Change if needed

const uint32_t READ_INTERVAL_MS = 500;
const unsigned long ECHO_TIMEOUT_US = 30000;  // ~5m timeout

unsigned long lastReadMs = 0;

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  if (duration == 0) {
    return -1.0f;  // No echo
  }

  // Speed of sound: ~0.0343 cm/us
  return (duration * 0.0343f) / 2.0f;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  Serial.println("=== HC-SR04 test (ESP32) ===");
  Serial.printf("TRIG=GPIO%u, ECHO=GPIO%u\n", TRIG_PIN, ECHO_PIN);
  Serial.println("If you get timeout often, check wiring and power (5V + GND).\n");
}

void loop() {
  if (millis() - lastReadMs < READ_INTERVAL_MS) {
    return;
  }
  lastReadMs = millis();

  float distanceCm = readDistanceCm();

  if (distanceCm < 0.0f) {
    Serial.println("Distance: timeout (no echo)");
  } else {
    Serial.printf("Distance: %.2f cm\n", distanceCm);
  }
}
