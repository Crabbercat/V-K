// ESP32 Offline Component Test
// Pins (as requested):
// Heater LED -> GPIO2
// Temperature (LM35) -> GPIO35 (ADC input-only)
// Soil moisture -> GPIO34 (ADC input-only)
// Servo -> GPIO13

#include <Arduino.h>
#include <ESP32Servo.h>

const int LED_HEATER_PIN = 2;
const uint8_t TEMP_SENSOR_PIN = 35; // ADC input-only
const uint8_t SOIL_PIN = 34;        // ADC input-only
const int SERVO_PIN = 13;

const int SERVO_OPEN_ANGLE = 90;
const int SERVO_CLOSE_ANGLE = 0;

const unsigned long READ_INTERVAL_MS = 1000;
unsigned long lastRead = 0;

Servo servo;
bool heaterOn = false;
int currentServoAngle = SERVO_CLOSE_ANGLE;

void printMenu(){
  Serial.println(F("\nOffline Test Controls:"));
  Serial.println(F("  o - open servo (90)") );
  Serial.println(F("  c - close servo (0)") );
  Serial.println(F("  h - toggle heater LED") );
  Serial.println(F("  s - show last sensor values") );
  Serial.println(F("  m - show this menu") );
}

void setup(){
  Serial.begin(115200);
  delay(500);
  Serial.println(F("=== ESP32 Offline Test ==="));

  pinMode(LED_HEATER_PIN, OUTPUT);
  digitalWrite(LED_HEATER_PIN, LOW);
  heaterOn = false;

  // ADC setup
  analogReadResolution(12);
  analogSetPinAttenuation(TEMP_SENSOR_PIN, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  // Servo
  servo.attach(SERVO_PIN);
  servo.write(SERVO_CLOSE_ANGLE);
  currentServoAngle = SERVO_CLOSE_ANGLE;

  Serial.println(F("Pins: Heater=GPIO2, Temp=GPIO35, Soil=GPIO34, Servo=GPIO13"));
  printMenu();
}

float readTemperatureC(){
  // Using analogReadMilliVolts if available; falls back to raw-to-mV estimate
  #if defined(analogReadMilliVolts)
    uint32_t mv = analogReadMilliVolts(TEMP_SENSOR_PIN);
    return mv / 10.0f; // LM35: 10 mV per °C
  #else
    int raw = analogRead(TEMP_SENSOR_PIN);
    // approximate: assume 3300 mV reference
    float mv = (raw / 4095.0f) * 3300.0f;
    return mv / 10.0f;
  #endif
}

int readSoil(){
  return analogRead(SOIL_PIN); // 0-4095
}

void setServoAngle(int angle){
  if (angle == currentServoAngle) {
    Serial.printf("Servo angle already %d\n", angle);
    return;
  }
  servo.write(angle);
  Serial.printf("Servo: set angle %d (was %d)\n", angle, currentServoAngle);
  currentServoAngle = angle;
}

void toggleHeater(){
  heaterOn = !heaterOn;
  digitalWrite(LED_HEATER_PIN, heaterOn ? HIGH : LOW);
  Serial.printf("Heater: %s\n", heaterOn ? "ON" : "OFF");
}

void processSerial(){
  while (Serial.available()){
    char c = Serial.read();
    switch (c){
      case 'o': case 'O': setServoAngle(SERVO_OPEN_ANGLE); break;
      case 'c': case 'C': setServoAngle(SERVO_CLOSE_ANGLE); break;
      case 'h': case 'H': toggleHeater(); break;
      case 's': case 'S': {
        float t = readTemperatureC();
        int soil = readSoil();
        Serial.printf("Sensors -> Temp: %.2f C, Soil: %d\n", t, soil);
        break; }
      case 'm': case 'M': printMenu(); break;
      default: break;
    }
  }
}

void loop(){
  processSerial();

  if (millis() - lastRead < READ_INTERVAL_MS) return;
  lastRead = millis();

  float temp = readTemperatureC();
  int soil = readSoil();
  Serial.printf("Auto Read -> Temp: %.2f C, Soil: %d\n", temp, soil);
}
