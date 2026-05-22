// ESP32 Offline Component Test (MQTT hardware mapping)
// Pump relay -> GPIO26
// LED PWM light/heating simulator -> GPIO27
// Temperature (LM35) -> GPIO35
// Soil moisture -> GPIO34

#include <Arduino.h>

const uint8_t PUMP_RELAY_PIN = 26;
const uint8_t LIGHT_PWM_PIN = 27;
const uint8_t TEMP_SENSOR_PIN = 35;
const uint8_t SOIL_PIN = 34;

const uint32_t READ_INTERVAL_MS = 1000;
unsigned long lastReadMs = 0;

// Calibrate these 2 values with your own sensor.
const int SOIL_ADC_DRY = 3200;
const int SOIL_ADC_WET = 1400;

bool pumpOn = false;
uint8_t lightLevel = 0;
bool lightBrightening = true;

void printMenu() {
  Serial.println(F("\nOffline Test Controls:"));
  Serial.println(F("  p - toggle pump relay"));
  Serial.println(F("  l - toggle LED light"));
  Serial.println(F("  b - cycle LED brightness"));
  Serial.println(F("  s - show sensor values now"));
  Serial.println(F("  m - show this menu"));
}

void setRelay(uint8_t pin, bool on) { digitalWrite(pin, on ? HIGH : LOW); }

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

void setLightLevel(uint8_t level) {
  lightLevel = level;
  ledcWrite(0, lightLevel);
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
        if (lightLevel > 0) {
          setLightLevel(0);
          Serial.println("Light: OFF");
        } else {
          setLightLevel(255);
          Serial.println("Light: ON");
        }
        break;
      case 'b':
      case 'B':
        if (lightBrightening) {
          lightLevel = min<uint8_t>(255, lightLevel + 51);
          if (lightLevel == 255) lightBrightening = false;
        } else {
          lightLevel = max<uint8_t>(0, lightLevel - 51);
          if (lightLevel == 0) lightBrightening = true;
        }
        setLightLevel(lightLevel);
        Serial.printf("Light PWM: %u/255\n", lightLevel);
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
  pinMode(LIGHT_PWM_PIN, OUTPUT);

  ledcSetup(0, 1000, 8);
  ledcAttachPin(LIGHT_PWM_PIN, 0);

  setRelay(PUMP_RELAY_PIN, LOW);
  setLightLevel(0);

  analogReadResolution(12);
  analogSetPinAttenuation(TEMP_SENSOR_PIN, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  Serial.println(F("=== ESP32 Offline Test (MQTT Wiring) ==="));
  Serial.println(F("Pins: Pump=26, Light PWM=27, Temp=35, Soil=34"));
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
