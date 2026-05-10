#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// ====== Update these values ======
const char* WIFI_SSID = "BI BIT";
const char* WIFI_PASS = "abcd1234";
const char* SERVER_HOST = "192.168.1.213"; // IP of your PC running server
const uint16_t SERVER_PORT = 5000;
// ================================

const int SERVO_PIN = 13;
const int LED_HEATER_PIN = 2;

// Sensor pins
const uint8_t TEMP_SENSOR_PIN = 35;      // LM35 temperature sensor
const uint8_t SOIL_PIN = 34;             // Soil moisture sensor

const int SERVO_OPEN_ANGLE = 90;   // Angle to open water valve
const int SERVO_CLOSE_ANGLE = 0;   // Angle to close water valve

Servo servo;
unsigned long lastSend = 0;
bool wifiConnected = false;
int currentServoAngle = SERVO_CLOSE_ANGLE;
const unsigned long UPDATE_INTERVAL_MS = 3000;
int pendingCommandVersion = 0;
bool pendingHeater = false;
bool pendingWaterValve = false;
int pendingServoAngle = SERVO_CLOSE_ANGLE;
bool hasPendingCommand = false;

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_HEATER_PIN, OUTPUT);
  digitalWrite(LED_HEATER_PIN, LOW);
  servo.attach(SERVO_PIN);

  // Configure analog pins for sensors
  analogReadResolution(12);
  analogSetPinAttenuation(TEMP_SENSOR_PIN, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());
  wifiConnected = true;
  // initialize servo to closed position
  servo.write(SERVO_CLOSE_ANGLE);
  currentServoAngle = SERVO_CLOSE_ANGLE;
  Serial.println("Servo initialized to closed position");
}

String serverUrl(const char* path){
  char buf[128];
  snprintf(buf, sizeof(buf), "http://%s:%d%s", SERVER_HOST, SERVER_PORT, path);
  return String(buf);
}

void applyCommands(JsonObject cmd){
  if (cmd.containsKey("heater")){
    bool on = cmd["heater"];
    digitalWrite(LED_HEATER_PIN, on ? HIGH : LOW);
    Serial.printf("Heater command from server: %s\n", on ? "ON" : "OFF");
  }
  if (cmd.containsKey("servoAngle")){
    int angle = cmd["servoAngle"];
    // Only change servo if angle differs
    if (angle != currentServoAngle) {
      servo.write(angle);
      Serial.printf("Servo command from server: set angle %d (was %d)\n", angle, currentServoAngle);
      currentServoAngle = angle;
    } else {
      Serial.printf("Servo command from server: angle %d (no change)\n", angle);
    }
  }
}

void applyPendingCommandIfNeeded(){
  if (!hasPendingCommand) return;

  digitalWrite(LED_HEATER_PIN, pendingHeater ? HIGH : LOW);
  if (pendingServoAngle != currentServoAngle) {
    servo.write(pendingServoAngle);
    Serial.printf("Applying requested servo angle %d (was %d)\n", pendingServoAngle, currentServoAngle);
    currentServoAngle = pendingServoAngle;
  }

  Serial.printf("Applying requested heater %s, waterValve %s, requestVersion %d\n",
                pendingHeater ? "ON" : "OFF",
                pendingWaterValve ? "OPEN" : "CLOSED",
                pendingCommandVersion);
}

void loop() {
  if (millis() - lastSend < UPDATE_INTERVAL_MS) return; // every 3s
  lastSend = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (wifiConnected) {
      Serial.println("WiFi disconnected, will not attempt automatic reconnect.");
      wifiConnected = false;
    }
    return;
  }

  // Read real sensor values
  // Temperature from LM35 sensor (mV / 10 = °C)
  uint32_t tempMilliVolts = analogReadMilliVolts(TEMP_SENSOR_PIN);
  float temperature = tempMilliVolts / 10.0f;

  // Soil moisture sensor (0-4095 for 12-bit ADC)
  int soilMoisture = analogRead(SOIL_PIN);
  
  bool waterValve = (currentServoAngle == SERVO_OPEN_ANGLE);
  bool heaterStatus = digitalRead(LED_HEATER_PIN) == HIGH;

  // Log sensor readings
  Serial.printf("Sensors -> Temp: %.2f C, Soil: %d, Heater: %s, ValveOpen: %s, Servo: %d\n",
                temperature, soilMoisture, heaterStatus ? "ON" : "OFF", waterValve ? "YES" : "NO", currentServoAngle);

  // Pull requested command from server
  {
    HTTPClient http;
    http.begin(serverUrl("/api/commands"));
    int code = http.GET();
    Serial.printf("GET /api/commands -> %d\n", code);
    if (code == 200){
      String body = http.getString();
      Serial.print("Commands body: "); Serial.println(body);
      StaticJsonDocument<256> resp;
      DeserializationError err = deserializeJson(resp, body);
      if (!err){
        JsonObject root = resp.as<JsonObject>();
        int requestVersion = root["requestVersion"] | 0;
        JsonVariant requestedVariant = root["requested"];
        if (requestedVariant.isNull()) {
          hasPendingCommand = false;
        } else if (requestVersion != pendingCommandVersion) {
          JsonObject requested = requestedVariant.as<JsonObject>();
          pendingCommandVersion = requestVersion;
          pendingHeater = requested["heater"] | heaterStatus;
          pendingServoAngle = requested["servoAngle"] | currentServoAngle;
          pendingWaterValve = requested["waterValve"] | (pendingServoAngle == SERVO_OPEN_ANGLE);
          hasPendingCommand = true;
          applyPendingCommandIfNeeded();
        }
      } else {
        Serial.println("Failed parse commands");
      }
    }
    http.end();
  }

  if (hasPendingCommand) {
    waterValve = pendingWaterValve;
    heaterStatus = digitalRead(LED_HEATER_PIN) == HIGH;
  }

  // Prepare JSON with real sensor data
  StaticJsonDocument<256> doc;
  doc["temperature"] = temperature;
  doc["soilMoisture"] = soilMoisture;
  doc["heaterStatus"] = heaterStatus;
  doc["waterValve"] = waterValve;
  doc["servoAngle"] = currentServoAngle;
  if (hasPendingCommand) {
    doc["appliedCommandVersion"] = pendingCommandVersion;
  }

  String payload;
  serializeJson(doc, payload);

  {
    HTTPClient http;
    http.begin(serverUrl("/api/sensor"));
    http.addHeader("Content-Type", "application/json");
    Serial.print("Sending payload to /api/sensor: ");
    Serial.println(payload);
    int r = http.POST(payload);
    String postResp = http.getString();
    Serial.printf("POST /api/sensor -> %d\n", r);
    if (postResp.length()) Serial.printf("Server POST response: %s\n", postResp.c_str());
    http.end();
  }

  if (hasPendingCommand) {
    Serial.printf("Request version %d applied and reported back to server\n", pendingCommandVersion);
    hasPendingCommand = false;
  }
}
