#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ===== WiFi =====
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

// ===== MQTT =====
const char* MQTT_HOST = "192.168.1.100";
const uint16_t MQTT_PORT = 1883;
const char* DEVICE_ID = "esp32-001";

// ===== Pins (from migration spec) =====
const uint8_t SOIL_PIN = 34;
const uint8_t TEMP_PIN = 35;  // LM35 default
const uint8_t PUMP_RELAY_PIN = 26;
const uint8_t LIGHT_RELAY_PIN = 27;
const uint8_t HEATER_RELAY_PIN = 25;

// Calibrate these values based on your specific YL-69 sensor.
const int SOIL_ADC_DRY = 3200;
const int SOIL_ADC_WET = 1400;

// ===== Sensor timing =====
const unsigned long SENSOR_INTERVAL_MS = 10000;
const unsigned long TELEMETRY_INTERVAL_MS = 30000;
const unsigned long HEARTBEAT_INTERVAL_MS = 60000;

struct SensorSnapshot {
  float temperature = 0.0f;
  int soilMoisture = 0;
  unsigned long lastReadMs = 0;
};

class RelayController {
public:
  RelayController(uint8_t pin, bool activeLow = false)
      : _pin(pin), _activeLow(activeLow), _state(false) {}

  void begin() {
    pinMode(_pin, OUTPUT);
    turnOff();
  }

  void turnOn() {
    _state = true;
    digitalWrite(_pin, _activeLow ? LOW : HIGH);
  }

  void turnOff() {
    _state = false;
    digitalWrite(_pin, _activeLow ? HIGH : LOW);
  }

  void setState(bool on) {
    if (on) {
      turnOn();
    } else {
      turnOff();
    }
  }

  bool getState() const { return _state; }

private:
  uint8_t _pin;
  bool _activeLow;
  bool _state;
};

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
SensorSnapshot sensors;
RelayController waterPumpRelay(PUMP_RELAY_PIN);
RelayController lightRelay(LIGHT_RELAY_PIN);
RelayController heaterRelay(HEATER_RELAY_PIN);

unsigned long lastSensorReadMs = 0;
unsigned long lastTelemetryMs = 0;
unsigned long lastHeartbeatMs = 0;

String topicTelemetry;
String topicStatus;
String topicCommand;

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

void publishStatus(bool online) {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["online"] = online;
  doc["pump"] = waterPumpRelay.getState();
  doc["light"] = lightRelay.getState();
  doc["heater"] = heaterRelay.getState();
  doc["timestamp"] = millis();

  String payload;
  serializeJson(doc, payload);
  mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.print("[MQTT] Invalid command payload: ");
    Serial.println(err.c_str());
    return;
  }

  bool changed = false;

  if (doc.containsKey("pump")) {
    bool value = doc["pump"];
    waterPumpRelay.setState(value);
    changed = true;
  }
  if (doc.containsKey("light")) {
    bool value = doc["light"];
    lightRelay.setState(value);
    changed = true;
  }
  if (doc.containsKey("heater")) {
    bool value = doc["heater"];
    heaterRelay.setState(value);
    changed = true;
  }

  if (changed) {
    Serial.printf("[CMD] Applied command from topic: %s\n", topic);
    publishStatus(true);
  }
}

void ensureMqttConnected() {
  if (mqttClient.connected()) {
    return;
  }

  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Connecting...");
    if (mqttClient.connect(DEVICE_ID)) {
      Serial.println("ok");
      mqttClient.subscribe(topicCommand.c_str());
      publishStatus(true);
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(", retry in 2s");
      delay(2000);
    }
  }
}

void readSensors() {
  int soilRaw = analogRead(SOIL_PIN);
  int soilPercent = map(soilRaw, SOIL_ADC_DRY, SOIL_ADC_WET, 0, 100);
  soilPercent = constrain(soilPercent, 0, 100);
  sensors.soilMoisture = soilPercent;
  uint32_t tempMilliVolts = analogReadMilliVolts(TEMP_PIN);
  sensors.temperature = tempMilliVolts / 10.0f;
  sensors.lastReadMs = millis();

  Serial.printf("[SENSOR] temp=%.2fC soil=%d%% (raw=%d)\n", sensors.temperature, sensors.soilMoisture, soilRaw);
}

void publishTelemetry() {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["temperature"] = sensors.temperature;
  doc["soilMoisture"] = sensors.soilMoisture;
  doc["timestamp"] = millis();

  String payload;
  serializeJson(doc, payload);

  bool ok = mqttClient.publish(topicTelemetry.c_str(), payload.c_str());
  Serial.printf("[MQTT] publish telemetry %s\n", ok ? "OK" : "FAILED");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  analogSetPinAttenuation(TEMP_PIN, ADC_11db);

  waterPumpRelay.begin();
  lightRelay.begin();
  heaterRelay.begin();

  topicTelemetry = String("plant/device/") + DEVICE_ID + "/telemetry";
  topicStatus = String("plant/device/") + DEVICE_ID + "/status";
  topicCommand = String("plant/device/") + DEVICE_ID + "/command";

  ensureWiFiConnected();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  ensureMqttConnected();
}

void loop() {
  ensureWiFiConnected();
  ensureMqttConnected();
  mqttClient.loop();

  unsigned long now = millis();

  if (now - lastSensorReadMs >= SENSOR_INTERVAL_MS) {
    lastSensorReadMs = now;
    readSensors();
  }

  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    publishTelemetry();
  }

  if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    publishStatus(true);
  }
}
