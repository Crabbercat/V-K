# ESP <-> PC WebSocket (Simple Example)

This folder contains:
- `esp_websocket_client/esp_websocket_client.ino`: ESP WebSocket client
- `pc_ws_server.py`: WebSocket echo server on your computer
- `requirements.txt`: Python dependency

## 1) Run WebSocket server on PC

1. Open terminal in this folder.
2. Install dependency:

```bash
pip install -r requirements.txt
```

3. Start server:

```bash
python pc_ws_server.py
```

You should see:
- `Starting WebSocket server at ws://0.0.0.0:8765`

## 2) Flash ESP sketch

1. Open `esp_websocket_client.ino` in Arduino IDE.
2. Install library:
- **WebSockets** by Markus Sattler
3. Update values in sketch:
- `WIFI_SSID`
- `WIFI_PASS`
- `WS_HOST` = your computer local IP (example `192.168.1.100`)
4. Wire `LM35` output pin to `GPIO34` (recommended for ESP32).
5. Select your board ESP32 and upload.
6. Open Serial Monitor at `115200` baud.

LM35 notes:
- LM35 output uses `10mV / 1°C` and code converts `mV` to `°C`.
- If you must use `D4` (GPIO4), note that it is `ADC2` and can be unstable while WiFi is on.
- Recommended ESP32 analog pins for LM35 are `ADC1`: `GPIO32/33/34/35/36/39`.

## 3) Test connection

If successful:
- PC terminal prints client connected and incoming messages.
- ESP Serial Monitor shows connected and echo responses.

## 4) Open Web UI (for better display)

1. Keep the server running:

```bash
python pc_ws_server.py
```

2. Open this file in browser:

- `web_client.html`

3. In the UI:

- Set `WebSocket URL` (default: `ws://localhost:8765`)
- Click **Kết nối**
- Type message and click **Gửi**
- Check realtime logs, TX/RX counters, and `Nhiệt độ (chan 4)` tile

## Notes

- Make sure ESP and PC are on the same local network.
- Allow Python through Windows Firewall when prompted.
- If connection fails, verify `WS_HOST`, port `8765`, and WiFi credentials.
