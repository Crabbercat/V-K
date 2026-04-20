#include <WiFi.h>
#include <WebSocketsClient.h>

// ====== Update these values ======
const char* WIFI_SSID = "BI BIT";
const char* WIFI_PASS = "abcd1234";
const char* WS_HOST = "192.168.1.69";  // PC local IP
const uint16_t WS_PORT = 8765;
const char* WS_PATH = "/";
// ================================

WebSocketsClient webSocket;
unsigned long lastSendMs = 0;

void onWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] Disconnected");
      break;

    case WStype_CONNECTED:
      Serial.printf("[WS] Connected to: %s\n", payload);
      webSocket.sendTXT("Hello from ESP");
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

  connectWiFi();

  webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  webSocket.onEvent(onWebSocketEvent);
  webSocket.setReconnectInterval(3000);
}

void loop() {
  webSocket.loop();

  // Send a message every 5 seconds.
  if (millis() - lastSendMs >= 5000) {
    lastSendMs = millis();

    if (WiFi.status() == WL_CONNECTED) {
      String msg = "ESP millis=" + String(millis());
      webSocket.sendTXT(msg);
      Serial.println("[WS] Sent: " + msg);
    }
  }
}
