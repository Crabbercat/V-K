// ESP32 + SG90 simple test
// Servo sweeps 0 -> 180 -> 0 continuously.

#include <ESP32Servo.h>

const uint8_t SERVO_PIN = 19;
const uint16_t SERVO_MIN_US = 500;
const uint16_t SERVO_MAX_US = 2400;

Servo sg90;

void setup() {
  Serial.begin(115200);
  delay(500);

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  sg90.setPeriodHertz(50);
  sg90.attach(SERVO_PIN, SERVO_MIN_US, SERVO_MAX_US);

  Serial.printf("[SG90] Test started on GPIO%u\n", SERVO_PIN);
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 5) {
    sg90.write(angle);
    delay(25);
  }

  for (int angle = 180; angle >= 0; angle -= 5) {
    sg90.write(angle);
    delay(25);
  }
}
