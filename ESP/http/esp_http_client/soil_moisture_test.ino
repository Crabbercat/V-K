// ESP32 Soil Moisture Sensor Test
// Pin: GPIO18 (D18)
// Output: 0-4095 (12-bit ADC)

#include <Arduino.h>

const uint8_t SOIL_PIN = 18;  // GPIO18 - Soil moisture sensor
const uint32_t READ_INTERVAL_MS = 1000;

unsigned long lastReadMs = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  Serial.println("=== Soil Moisture Sensor Test (GPIO18) ===");
  Serial.println("Reading every 1 second...");
  Serial.println("ADC Range: 0-4095 (lower = drier, higher = wetter)");
  Serial.println("Thresholds: DRY < 2000 | WET > 3000");
}

void loop() {
  if (millis() - lastReadMs < READ_INTERVAL_MS) {
    return;
  }
  lastReadMs = millis();

  int soilMoisture = analogRead(SOIL_PIN);
  
  String state;
  if (soilMoisture < 2000) {
    state = "DRY (need water)";
  } else if (soilMoisture > 3000) {
    state = "WET (stop watering)";
  } else {
    state = "NORMAL (between threshold)";
  }

  Serial.printf("Soil: %d | %s\n", soilMoisture, state.c_str());
}
