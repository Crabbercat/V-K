  #include <WiFi.h>
  #include <WebSocketsClient.h>

  // ====== Update these values ======
  const char* WIFI_SSID = "BI BIT";
  const char* WIFI_PASS = "abcd1234";
  const char* WS_HOST = "192.168.1.77";  // PC local IP
  const uint16_t WS_PORT = 8765;
  const char* WS_PATH = "/";

  // ESP32: prefer ADC1 pin for analog reading while WiFi is enabled.
  // D4 on many ESP32 boards maps to GPIO4 (ADC2) and may be unstable with WiFi.
  const uint8_t TEMP_SENSOR_PIN = 35;
  const uint8_t HC_TRIG_PIN = 5;
  const uint8_t HC_ECHO_PIN = 18;
  const uint32_t SEND_INTERVAL_MS = 1000;
  const unsigned long HC_ECHO_TIMEOUT_US = 30000;
  // ================================

  WebSocketsClient webSocket;
  unsigned long lastSendMs = 0;

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

  void sendTemperaturePayload() {
    uint16_t rawAdc = analogRead(TEMP_SENSOR_PIN);
    uint32_t milliVolts = analogReadMilliVolts(TEMP_SENSOR_PIN);
    float temperatureC = milliVolts / 10.0;
    float distanceCm = readDistanceCm();

    String msg = "{\"device\":\"esp32\",\"sensor\":\"environment\",\"temperature_pin\":" + String(TEMP_SENSOR_PIN) + ",\"temperature_c\":" + String(temperatureC, 2) + ",\"distance_cm\":" + String(distanceCm, 2) + ",\"hcsr04_trig\":" + String(HC_TRIG_PIN) + ",\"hcsr04_echo\":" + String(HC_ECHO_PIN) + "}";
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
        lastSendMs = millis();
        break;

      case WStype_TEXT:
        Serial.printf("[WS] Received: %s\n", payload);
        break;

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

    Serial.printf("[LM35] Sensor mode enabled on GPIO%u\n", TEMP_SENSOR_PIN);
    Serial.println("[LM35] ESP32 tip: Use ADC1 pins (GPIO32/33/34/35/36/39) for stable readings with WiFi.");
    Serial.printf("[HC-SR04] TRIG=GPIO%u, ECHO=GPIO%u\n", HC_TRIG_PIN, HC_ECHO_PIN);

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
