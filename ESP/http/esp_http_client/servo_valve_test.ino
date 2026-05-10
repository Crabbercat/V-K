// ESP32 Servo Motor (Water Valve) Test
// Pin: GPIO13 (D13)
// Opens (90°) and closes (0°) repeatedly

#include <Arduino.h>
#include <ESP32Servo.h>

const int SERVO_PIN = 13;  // GPIO13
const int SERVO_CLOSE_ANGLE = 0;
const int SERVO_OPEN_ANGLE = 90;
const uint32_t CHANGE_INTERVAL_MS = 3000;

Servo servo;
unsigned long lastChangeMs = 0;
bool isOpen = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

  servo.attach(SERVO_PIN);
  servo.write(SERVO_CLOSE_ANGLE);
  isOpen = false;

  Serial.println("=== Servo Motor (Water Valve) Test (GPIO13) ===");
  Serial.println("Toggling between open (90°) and closed (0°) every 3 seconds...");
  Serial.println();
}

void loop() {
  if (millis() - lastChangeMs < CHANGE_INTERVAL_MS) {
    return;
  }
  lastChangeMs = millis();

  if (isOpen) {
    // Close valve
    servo.write(SERVO_CLOSE_ANGLE);
    Serial.println("Servo: CLOSE (0°)");
    isOpen = false;
  } else {
    // Open valve
    servo.write(SERVO_OPEN_ANGLE);
    Serial.println("Servo: OPEN (90°)");
    isOpen = true;
  }
}
