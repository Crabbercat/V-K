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

// ===== Pins =====
const uint8_t SOIL_PIN = 34;
const uint8_t TEMP_PIN = 35;  // LM35
const uint8_t LDR_PIN = 32;   // photoresistor (LDR)
const uint8_t LIGHT_PWM_PIN = 27; // LED output, used to simulate lighting/heating
const uint8_t PUMP_RELAY_PIN = 26;

// Calibrate these values for your YL-69 sensor.
const int SOIL_ADC_DRY = 3200;
const int SOIL_ADC_WET = 1400;
const float LIGHT_LUX_MAX = 2000.0f;
const unsigned long PUMP_AUTO_OFF_MS = 2000;

// ===== Timing =====
const unsigned long SENSOR_INTERVAL_MS = 10000;
const unsigned long TELEMETRY_INTERVAL_MS = 30000;
const unsigned long HEARTBEAT_INTERVAL_MS = 60000;

struct SensorSnapshot {
  float temperature = 0.0f;
  int soilMoisture = 0;
  int brightness = 0;
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

  void setState(bool on) { on ? turnOn() : turnOff(); }
  bool getState() const { return _state; }

private:
  uint8_t _pin;
  bool _activeLow;
  bool _state;
};

class LightController {
public:
  explicit LightController(uint8_t pin) : _pin(pin), _level(0) {}

  void begin() {
    pinMode(_pin, OUTPUT);
    ledcAttach(_pin, 1000, 8);
    setLevel(0);
  }

  void setLevel(uint8_t level) {
    _level = level;
    ledcWrite(_pin, _level);
  }

  uint8_t getLevel() const { return _level; }

private:
  uint8_t _pin;
  uint8_t _level;
};

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
SensorSnapshot sensors;
RelayController waterPumpRelay(PUMP_RELAY_PIN);
LightController lightController(LIGHT_PWM_PIN);

unsigned long lastSensorReadMs = 0;
unsigned long lastTelemetryMs = 0;
unsigned long lastHeartbeatMs = 0;
unsigned long pumpAutoOffAtMs = 0;

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
  doc["lightLevel"] = lightController.getLevel();
  doc["brightness"] = sensors.brightness;
  doc["timestamp"] = millis();

  String payload;
  serializeJson(doc, payload);
  mqttClient.publish(topicStatus.c_str(), payload.c_str(), true);
}

void startPumpAutoOffTimer() {
  pumpAutoOffAtMs = millis() + PUMP_AUTO_OFF_MS;
}

void stopPumpAutoOffTimer() {
  pumpAutoOffAtMs = 0;
}

void applyPumpState(bool on) {
  waterPumpRelay.setState(on);
  if (on) {
    startPumpAutoOffTimer();
  } else {
    stopPumpAutoOffTimer();
  }
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
    waterPumpRelay.setState(doc["pump"]);
    changed = true;
  }

  if (doc.containsKey("lightLevel")) {
    int level = constrain((int)doc["lightLevel"], 0, 255);
    lightController.setLevel((uint8_t)level);
    changed = true;
  } else if (doc.containsKey("light")) {
    lightController.setLevel(doc["light"] ? 255 : 0);
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
  sensors.soilMoisture = constrain(soilPercent, 0, 100);

  uint32_t tempMilliVolts = analogReadMilliVolts(TEMP_PIN);
  sensors.temperature = tempMilliVolts / 10.0f;

  uint16_t ldrRaw = analogRead(LDR_PIN);
  int brightnessPercent = map(ldrRaw, 0, 4095, 100, 0);
  sensors.brightness = constrain(brightnessPercent, 0, 100);

  sensors.lastReadMs = millis();
  Serial.printf("[SENSOR] temp=%.2fC soil=%d%% ldr=%d%% (soilRaw=%d ldrRaw=%d)\n",
                sensors.temperature, sensors.soilMoisture, sensors.brightness, soilRaw, ldrRaw);
}

void publishTelemetry() {
  StaticJsonDocument<256> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["temperature"] = sensors.temperature;
  doc["soilMoisture"] = sensors.soilMoisture;
  doc["brightness"] = sensors.brightness;
  doc["lightLevel"] = lightController.getLevel();
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
  analogSetPinAttenuation(LDR_PIN, ADC_11db);

  waterPumpRelay.begin();
  lightController.begin();

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

  if (waterPumpRelay.getState() && pumpAutoOffAtMs != 0 && now >= pumpAutoOffAtMs) {
    waterPumpRelay.turnOff();
    stopPumpAutoOffTimer();
    publishStatus(true);
    Serial.println("[PUMP] Auto-off after 2 seconds");
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