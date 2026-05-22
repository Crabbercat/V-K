// ESP32 Offline Component Test (MQTT hardware mapping)
// Pump relay -> GPIO26
// Light relay -> GPIO27
// Heater relay -> GPIO25
// Temperature (LM35) -> GPIO35
// Soil moisture -> GPIO34

#include <Arduino.h>

const uint8_t PUMP_RELAY_PIN = 26;
const uint8_t LIGHT_RELAY_PIN = 27;
const uint8_t HEATER_RELAY_PIN = 25;
const uint8_t TEMP_SENSOR_PIN = 35;
const uint8_t SOIL_PIN = 34;

const uint32_t READ_INTERVAL_MS = 1000;
unsigned long lastReadMs = 0;

// Calibrate these 2 values with your own sensor.
const int SOIL_ADC_DRY = 3200;
const int SOIL_ADC_WET = 1400;

bool pumpOn = false;
bool lightOn = false;
bool heaterOn = false;

void printMenu() {
  Serial.println(F("\nOffline Test Controls:"));
  Serial.println(F("  p - toggle pump relay"));
  Serial.println(F("  l - toggle light relay"));
  Serial.println(F("  h - toggle heater relay"));
  Serial.println(F("  s - show sensor values now"));
  Serial.println(F("  m - show this menu"));
}

void setRelay(uint8_t pin, bool on) {
  digitalWrite(pin, on ? HIGH : LOW);
}

float readTemperatureC() {
  uint32_t milliVolts = analogReadMilliVolts(TEMP_SENSOR_PIN);
  return milliVolts / 10.0f;
}

int readSoilPercent() {
  int raw = analogRead(SOIL_PIN);
  int percent = map(raw, SOIL_ADC_DRY, SOIL_ADC_WET, 0, 100);
  return constrain(percent, 0, 100);
}

void printSensors() {
  float temperature = readTemperatureC();
  int soilPercent = readSoilPercent();
  Serial.printf("Sensors -> Temp: %.2f C, Soil: %d%%\n", temperature, soilPercent);
}

void processSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    switch (c) {
      case 'p':
      case 'P':
        pumpOn = !pumpOn;
        setRelay(PUMP_RELAY_PIN, pumpOn);
        Serial.printf("Pump: %s\n", pumpOn ? "ON" : "OFF");
        break;
      case 'l':
      case 'L':
        lightOn = !lightOn;
        setRelay(LIGHT_RELAY_PIN, lightOn);
        Serial.printf("Light: %s\n", lightOn ? "ON" : "OFF");
        break;
      case 'h':
      case 'H':
        heaterOn = !heaterOn;
        setRelay(HEATER_RELAY_PIN, heaterOn);
        Serial.printf("Heater: %s\n", heaterOn ? "ON" : "OFF");
        break;
      case 's':
      case 'S':
        printSensors();
        break;
      case 'm':
      case 'M':
        printMenu();
        break;
      default:
        break;
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(PUMP_RELAY_PIN, OUTPUT);
  pinMode(LIGHT_RELAY_PIN, OUTPUT);
  pinMode(HEATER_RELAY_PIN, OUTPUT);

  setRelay(PUMP_RELAY_PIN, LOW);
  setRelay(LIGHT_RELAY_PIN, LOW);
  setRelay(HEATER_RELAY_PIN, LOW);

  analogReadResolution(12);
  analogSetPinAttenuation(TEMP_SENSOR_PIN, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  Serial.println(F("=== ESP32 Offline Test (MQTT Wiring) ==="));
  Serial.println(F("Pins: Pump=26, Light=27, Heater=25, Temp=35, Soil=34"));
  printMenu();
}

void loop() {
  processSerial();

  if (millis() - lastReadMs < READ_INTERVAL_MS) {
    return;
  }
  lastReadMs = millis();

  float t = readTemperatureC();
  int soil = readSoilPercent();
  Serial.printf("Auto Read -> Temp: %.2f C, Soil: %d%%\n", t, soil);
}
