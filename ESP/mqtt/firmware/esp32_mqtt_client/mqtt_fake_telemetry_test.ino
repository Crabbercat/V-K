// ESP32 MQTT Fake Telemetry Test
// Purpose: verify WiFi + MQTT connection by publishing fake plant data to the broker.
// Upload this sketch when you want to test the MQTT pipeline without sensors.

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== WiFi =====
const char* WIFI_SSID = "1.1.1.1";
const char* WIFI_PASS = "112233445566";

// ===== MQTT =====
const char* MQTT_HOST = "10.87.55.236";
const uint16_t MQTT_PORT = 1883;
const char* DEVICE_ID = "esp32-001";

String topicTelemetry;
String topicStatus;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long lastPublishMs = 0;
const unsigned long PUBLISH_INTERVAL_MS = 5000;

float fakeTemperatureC = 26.5f;
int fakeSoilMoisture = 62;
int fakeLightIntensity = 780;
bool fakePump = false;
bool fakeLight = true;

void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("[WiFi] Connecting");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  Serial.print("[WiFi] Connected, IP=");
  Serial.println(WiFi.localIP());
}

void ensureMqttConnected() {
  if (mqttClient.connected()) {
    return;
  }

  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Connecting...");
    if (mqttClient.connect(DEVICE_ID)) {
      Serial.println("ok");
      publishStatus(true);
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(", retry in 2s");
      delay(2000);
    }
  }
}

void publishStatus(bool online) {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["online"] = online;
  doc["pump"] = fakePump;
  doc["light"] = fakeLight;
  doc["lightLevel"] = fakeLight ? 255 : 0;
  doc["timestamp"] = millis();

  String payload;
  serializeJson(doc, payload);
  mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);
}

void publishTelemetry() {
  // Small random walk to look like live sensor data.
  fakeTemperatureC += random(-25, 26) / 100.0f;
  fakeTemperatureC = constrain(fakeTemperatureC, 16.0f, 36.0f);

  fakeSoilMoisture += random(-2, 2);
  fakeSoilMoisture = constrain(fakeSoilMoisture, 5, 95);

  if (fakeSoilMoisture < 30) {
    fakePump = true;
    fakeSoilMoisture = min<int>(100, fakeSoilMoisture + (int)random(3, 6));
  } else {
    fakePump = false;
  }

  if (millis() / PUBLISH_INTERVAL_MS % 10 == 0) {
    fakeLight = !fakeLight;
  }

  if (fakeLight) {
    fakeLightIntensity += random(-30, 31);
    fakeLightIntensity = constrain(fakeLightIntensity, 600, 1200);
  } else {
    fakeLightIntensity += random(-10, 11);
    fakeLightIntensity = constrain(fakeLightIntensity, 50, 180);
  }

  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["temperature"] = roundf(fakeTemperatureC * 100.0f) / 100.0f;
  doc["soilMoisture"] = fakeSoilMoisture;
  doc["lightIntensity"] = fakeLightIntensity;
  doc["brightness"] = fakeLight ? 100 : 0;
  doc["pump"] = fakePump;
  doc["light"] = fakeLight;
  doc["fake"] = true;
  doc["timestamp"] = millis();

  String payload;
  serializeJson(doc, payload);

  bool ok = mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
  Serial.printf("[MQTT] fake telemetry %s -> %s\n", ok ? "OK" : "FAILED", payload.c_str());
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  randomSeed(esp_random());

  topicTelemetry = String("plant/device/") + DEVICE_ID + "/telemetry";
  topicStatus = String("plant/device/") + DEVICE_ID + "/status";

  ensureWiFiConnected();
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  ensureMqttConnected();

  Serial.println("=== MQTT Fake Telemetry Test ===");
  Serial.println("Publishing fake telemetry to MQTT broker...");
}

void loop() {
  ensureWiFiConnected();
  ensureMqttConnected();
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastPublishMs >= PUBLISH_INTERVAL_MS) {
    lastPublishMs = now;
    publishTelemetry();
    publishStatus(true);
  }
}