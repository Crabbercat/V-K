# IoT Plant Care (HTTP) - Simple Project

Project: Simple IoT system where ESP32 reads sensors and communicates with a Python HTTP server.

Structure:
- `pc_http_server.py` - Flask HTTP server that accepts sensor data, stores logs, runs simple automation, and exposes web dashboard
- `web_client.html`, `web_client.js`, `web_client.css` - simple web dashboard
- `esp_http_client/esp_http_client.ino` - ESP32 sketch that posts sensor data and polls commands
- `storage/` - stores `config.json`, `temperature.csv`, `data.json`, `commands.json`
- `requirements.txt` - Python dependencies

Quick start (PC):

```bash
python -m pip install -r requirements.txt
python pc_http_server.py
```

Open http://localhost:5000 in your browser to view the dashboard.

ESP32:
- Open `esp_http_client.ino` in Arduino IDE.
- Install libraries: `ArduinoJson` (v6), `Servo` (built-in), choose board ESP32 and upload.
- Edit `WIFI_SSID`, `WIFI_PASS`, `SERVER_HOST` in the sketch before uploading.

Notes:
- The server contains simple automation: when temperature < `temp_low` it enables `heater`; when humidity < `hum_low` it opens `waterValve`.
- You can manually override commands from the web dashboard.
