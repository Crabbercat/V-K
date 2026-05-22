// ESP32 Soil Moisture Test (YL-69)
// Pin: GPIO34
// Output: raw ADC (0-4095) and estimated percentage

#include <Arduino.h>

const uint8_t SOIL_PIN = 34;
const uint32_t READ_INTERVAL_MS = 1000;

// Calibrate these 2 values with your own sensor.
const int SOIL_ADC_DRY = 3200;
const int SOIL_ADC_WET = 1400;

unsigned long lastReadMs = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  Serial.println("=== Soil Moisture Test (GPIO34) ===");
  Serial.println("Reading every 1 second...");
  Serial.println("Format: raw | percent | zone");
}

void loop() {
  if (millis() - lastReadMs < READ_INTERVAL_MS) {
    return;
  }
  lastReadMs = millis();

  int raw = analogRead(SOIL_PIN);
  int percent = map(raw, SOIL_ADC_DRY, SOIL_ADC_WET, 0, 100);
  percent = constrain(percent, 0, 100);

  const char* zone = "OPTIMAL";
  if (percent < 30) {
    zone = "DRY";
  } else if (percent < 50) {
    zone = "WARNING";
  } else if (percent > 80) {
    zone = "WET";
  }

  Serial.printf("%d | %d%% | %s\n", raw, percent, zone);
}
