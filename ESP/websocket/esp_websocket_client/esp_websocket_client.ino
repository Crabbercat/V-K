  #include <WiFi.h>
  #include <WebSocketsClient.h>
  #include <ESP32Servo.h>

  // ====== CONFIG ======
  const char* WIFI_SSID = "BI BIT";
  const char* WIFI_PASS = "abcd1234";
  const char* WS_HOST = "192.168.1.94";
  const uint16_t WS_PORT = 8765;
  const char* WS_PATH = "/";

  const uint8_t TEMP_SENSOR_PIN = 35;
  const uint8_t HC_TRIG_PIN = 5;
  const uint8_t HC_ECHO_PIN = 18;
  const uint8_t SERVO_PIN = 19;
  const int SERVO_OPEN_ANGLE = 90;
  const int SERVO_CLOSED_ANGLE = 0;
  const int SERVO_STEP_DELAY_MS = 8;
  const uint32_t SEND_INTERVAL_MS = 1000;
  const unsigned long HC_ECHO_TIMEOUT_US = 30000;
  // ================================

  WebSocketsClient webSocket;
  Servo doorServo;
  unsigned long lastSendMs = 0;
  int servoAngle = SERVO_CLOSED_ANGLE;

  float readDistanceCm() {
    digitalWrite(HC_TRIG_PIN, LOW);
    delayMicroseconds(2);

    digitalWrite(HC_TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(HC_TRIG_PIN, LOW);

    unsigned long duration = pulseIn(HC_ECHO_PIN, HIGH, HC_ECHO_TIMEOUT_US);
    if (duration == 0) {
      return -1.0f;
    }

    return (duration * 0.0343f) / 2.0f;
  }

  void updateServoAngle(int targetAngle) {
    targerAngle = 90 - targerAngle
    targetAngle = constrain(targetAngle, 0, 180);

    if (!doorServo.attached()) {
      return;
    }

    if (targetAngle == servoAngle) {
      doorServo.write(targetAngle);
      return;
    }

    int step = targetAngle > servoAngle ? 1 : -1;
    for (int angle = servoAngle; angle != targetAngle; angle += step) {
      doorServo.write(angle);
      delay(SERVO_STEP_DELAY_MS);
    }

    doorServo.write(targetAngle);
    servoAngle = targetAngle;
  }

  String servoStateLabel() {
    return servoAngle >= 90 ? "open" : "closed";
  }

  void sendServoStatus() {
    String msg = "{\"device\":\"esp32\",\"type\":\"servo\",\"servo_angle\":" + String(servoAngle) + ",\"servo_state\":\"" + servoStateLabel() + "\"}";
    webSocket.sendTXT(msg);
    Serial.println("[WS] Sent: " + msg);
  }

  void openDoor() {
    updateServoAngle(SERVO_OPEN_ANGLE);
    sendServoStatus();
    Serial.println("[SERVO] Door opened");
  }

  void closeDoor() {
    updateServoAngle(SERVO_CLOSED_ANGLE);
    sendServoStatus();
    Serial.println("[SERVO] Door closed");
  }

  bool handleServoCommand(const String& command) {
    String normalized = command;
    normalized.trim();
    normalized.toUpperCase();

    if (normalized == "SERVO:OPEN" || normalized == "OPEN") {
      openDoor();
      return true;
    }

    if (normalized == "SERVO:CLOSE" || normalized == "CLOSE") {
      closeDoor();
      return true;
    }

    if (normalized.startsWith("SERVO:ANGLE:")) {
      int targetAngle = normalized.substring(String("SERVO:ANGLE:").length()).toInt();
      updateServoAngle(targetAngle);
      sendServoStatus();
      Serial.printf("[SERVO] Moved to %d degrees\n", servoAngle);
      return true;
    }

    return false;
  }

  void sendTemperaturePayload() {
    uint16_t rawAdc = analogRead(TEMP_SENSOR_PIN);
    uint32_t milliVolts = analogReadMilliVolts(TEMP_SENSOR_PIN);
    float temperatureC = milliVolts / 10.0;
    float distanceCm = readDistanceCm();

    String msg = "{\"device\":\"esp32\",\"sensor\":\"environment\",\"temperature_pin\":" + String(TEMP_SENSOR_PIN) + ",\"temperature_c\":" + String(temperatureC, 2) + ",\"distance_cm\":" + String(distanceCm, 2) + ",\"hcsr04_trig\":" + String(HC_TRIG_PIN) + ",\"hcsr04_echo\":" + String(HC_ECHO_PIN) + ",\"servo_angle\":" + String(servoAngle) + ",\"servo_state\":\"" + servoStateLabel() + "\"}";
    webSocket.sendTXT(msg);
    Serial.println("[WS] Sent: " + msg);
    Serial.printf("[LM35] raw=%u, mV=%lu, temp=%.2f C\n", rawAdc, milliVolts, temperatureC);
    if (distanceCm < 0.0f) {
      Serial.println("[HC-SR04] distance=timeout");
    } else {
      Serial.printf("[HC-SR04] distance=%.2f cm\n", distanceCm);
    }
  }

  void onWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
      case WStype_DISCONNECTED:
        Serial.println("[WS] Disconnected");
        break;

      case WStype_CONNECTED:
        Serial.printf("[WS] Connected to: %s\n", payload);
        sendTemperaturePayload();
        sendServoStatus();
        lastSendMs = millis();
        break;

      case WStype_TEXT: {
        String message;
        message.reserve(length);
        for (size_t i = 0; i < length; i++) {
          message += static_cast<char>(payload[i]);
        }

        Serial.println("[WS] Received: " + message);
        if (handleServoCommand(message)) {
          Serial.println("[WS] Servo command handled");
        }
        break;
      }

      case WStype_ERROR:
        Serial.println("[WS] Error");
        break;

      default:
        break;
    }
  }

  void connectWiFi() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    Serial.print("Connecting WiFi");
    while (WiFi.status() != WL_CONNECTED) {
      delay(500);
      Serial.print(".");
    }

    Serial.println();
    Serial.print("WiFi connected. ESP IP: ");
    Serial.println(WiFi.localIP());
  }

  void setup() {
    Serial.begin(115200);
    delay(1000);

    analogReadResolution(12);
    analogSetPinAttenuation(TEMP_SENSOR_PIN, ADC_11db);
    pinMode(HC_TRIG_PIN, OUTPUT);
    pinMode(HC_ECHO_PIN, INPUT);

    ESP32PWM::allocateTimer(0);
    ESP32PWM::allocateTimer(1);
    ESP32PWM::allocateTimer(2);
    ESP32PWM::allocateTimer(3);
    doorServo.setPeriodHertz(50);
    doorServo.attach(SERVO_PIN, 500, 2400);
    doorServo.write(SERVO_CLOSED_ANGLE);

    Serial.printf("[LM35] Sensor mode enabled on GPIO%u\n", TEMP_SENSOR_PIN);
    Serial.println("[LM35] ESP32 tip: Use ADC1 pins (GPIO32/33/34/35/36/39) for stable readings with WiFi.");
    Serial.printf("[HC-SR04] TRIG=GPIO%u, ECHO=GPIO%u\n", HC_TRIG_PIN, HC_ECHO_PIN);
    Serial.printf("[SERVO] SG90 on GPIO%u, closed=%d, open=%d\n", SERVO_PIN, SERVO_CLOSED_ANGLE, SERVO_OPEN_ANGLE);

    connectWiFi();

    webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
    webSocket.onEvent(onWebSocketEvent);
    webSocket.setReconnectInterval(3000);
  }

  void loop() {
    webSocket.loop();

    // Send sensor data periodically.
    if (millis() - lastSendMs >= SEND_INTERVAL_MS) {
      lastSendMs = millis();

      if (WiFi.status() == WL_CONNECTED) {
        sendTemperaturePayload();
      }
    }
  }
