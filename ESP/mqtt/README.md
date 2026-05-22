# 🌿 Indoor Plant Support System

Hệ thống giám sát và chăm sóc cây trồng trong nhà sử dụng ESP32, giao thức MQTT, Django backend và MongoDB.

## Tổng quan kiến trúc

```
ESP32 (sensor + relay)
        │
        │  MQTT publish/subscribe
        ▼
  Mosquitto Broker ◄──── fake_device_publisher.py (test)
        │
        ▼
  Django Backend ──── MongoDB
        │
        ▼
  Web Dashboard (http://localhost:8000)
```

| Thành phần        | Mô tả                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| **ESP32**     | Đọc cảm biến (nhiệt độ LM35, độ ẩm đất YL-69), điều khiển relay (bơm, đèn, sưởi) |
| **Mosquitto** | MQTT broker trung gian giữa ESP32 và backend                                                       |
| **Django**    | Nhận dữ liệu MQTT, lưu MongoDB, phục vụ dashboard, xử lý automation                          |
| **MongoDB**   | Lưu trữ telemetry, device status, commands, events                                                 |
| **Dashboard** | Giao diện web realtime hiển thị dữ liệu cảm biến và điều khiển thiết bị                 |

## MQTT Topics

| Topic                                 | Hướng          | Mô tả                                               |
| ------------------------------------- | ---------------- | ----------------------------------------------------- |
| `plant/device/{deviceId}/telemetry` | ESP32 → Backend | Dữ liệu cảm biến (temperature, soilMoisture)      |
| `plant/device/{deviceId}/status`    | ESP32 → Backend | Trạng thái thiết bị (online, pump, light, heater) |
| `plant/device/{deviceId}/command`   | Backend → ESP32 | Lệnh điều khiển (pump, light, heater on/off)      |

## Cấu trúc thư mục

```
mqtt/
├── backend/                      # Django backend
│   ├── apps/
│   │   ├── automation/           # App đăng ký automation rules
│   │   ├── dashboard/            # App chính: views, urls, khởi động MQTT
│   │   ├── devices/              # App đăng ký devices
│   │   └── telemetry/            # App đăng ký telemetry
│   ├── config/
│   │   ├── settings.py           # Django settings (MQTT, MongoDB config)
│   │   ├── mongo.py              # MongoDB connection & indexes
│   │   ├── urls.py               # URL routing
│   │   └── wsgi.py               # WSGI entry point
│   ├── mqtt_service/
│   │   ├── mqtt_client.py        # MQTT subscriber (kết nối broker, nhận message)
│   │   ├── mqtt_handlers.py      # Xử lý message: lưu DB, chạy automation
│   │   └── mqtt_publishers.py    # Gửi command tới ESP32
│   ├── static/dashboard/
│   │   ├── app.js                # Frontend logic (fetch API, render charts)
│   │   └── style.css             # Giao diện dashboard
│   ├── templates/dashboard/
│   │   └── index.html            # HTML template dashboard
│   ├── Dockerfile                # Docker image cho backend
│   ├── manage.py                 # Django CLI
│   └── requirements.txt          # Python dependencies
├── docker/
│   └── mosquitto/
│       └── mosquitto.conf        # Cấu hình Mosquitto broker
├── firmware/
│   ├── esp32_mqtt_client/        # Arduino firmware cho ESP32
│   └── README.md                 # Hướng dẫn firmware
├── tools/
│   └── fake_device_publisher.py  # Script giả lập ESP32 để test
├── docker-compose.yml            # Docker Compose stack
├── .gitignore
└── README.md                     # (file này)
```

---

## Yêu cầu hệ thống

- **Docker Desktop** (bao gồm Docker Compose)
- **Python 3.10+** (chỉ cần nếu chạy `fake_device_publisher.py`)
- **pip package**: `paho-mqtt` (chỉ cần cho fake publisher)

---

## Hướng dẫn chạy

### Quick start (Chạy nhanh)

1. Khởi động Docker stack và chờ các container sẵn sàng:

```bash
cd mqtt/
docker compose up --build -d
```

2. (Tùy chọn) Chạy giả lập thiết bị để thấy dữ liệu trên dashboard ngay lập tức:

```bash
pip install paho-mqtt
python tools/fake_device_publisher.py --interval 2
```

3. Mở dashboard: `http://localhost:8000`

--

### Bước 1: Khởi động Docker stack

```bash
cd mqtt/
docker compose up --build -d
```

Lệnh này khởi động 3 container:

| Container           | Port                                  | Mô tả                        |
| ------------------- | ------------------------------------- | ------------------------------ |
| `plant_django`    | `8000`                              | Django backend + MQTT listener |
| `plant_mosquitto` | `1883` (MQTT), `9001` (WebSocket) | MQTT broker                    |
| `plant_mongodb`   | `27017`                             | MongoDB database               |

Kiểm tra tất cả container đang chạy:

```bash
docker ps
```

Kết quả mong đợi — 3 container ở trạng thái `Up`:

```
CONTAINER ID   IMAGE                 STATUS         PORTS
xxxx           mqtt-django           Up             0.0.0.0:8000->8000/tcp
xxxx           eclipse-mosquitto:2   Up             0.0.0.0:1883->1883/tcp, 0.0.0.0:9001->9001/tcp
xxxx           mongo:7               Up             0.0.0.0:27017->27017/tcp
```

### Bước 2: Mở Dashboard

Truy cập **http://localhost:8000** trên trình duyệt.

### Bước 3: Chạy dữ liệu test (không cần ESP32 thật)

Cài đặt thư viện MQTT cho Python (chỉ cần lần đầu):

```bash
pip install paho-mqtt
```

Chạy script giả lập:

```bash
python tools/fake_device_publisher.py
```

Các tùy chọn:

| Flag            | Mặc định   | Mô tả                                    |
| --------------- | ------------- | ------------------------------------------ |
| `--host`      | `localhost` | Địa chỉ MQTT broker                     |
| `--port`      | `1883`      | Port MQTT broker                           |
| `--device-id` | `esp32-001` | ID thiết bị giả lập                    |
| `--interval`  | `3.0`       | Khoảng thời gian gửi dữ liệu (giây)  |
| `--seed`      | `None`      | Seed cho random (để tái tạo dữ liệu) |

Ví dụ chạy với tần suất 2 giây:

```bash
python tools/fake_device_publisher.py --interval 2
```

Output mẫu khi script chạy đúng:

```
Publishing fake data to localhost:1883 every 2.0s
Telemetry topic: plant/device/esp32-001/telemetry
Status topic:    plant/device/esp32-001/status
[2026-05-22T03:40:00+00:00] temp=27.15C soil=61% pump=False heater=False light=True
[2026-05-22T03:40:02+00:00] temp=27.32C soil=60% pump=False heater=False light=True
...
```

Sau khi chạy, dashboard tại `http://localhost:8000` sẽ tự động hiển thị dữ liệu realtime.

### Bước 4: Firmware ESP32 (khi có phần cứng thật)

Khi bạn có ESP32 thật, các bước chính để flash firmware:

1. Mở `firmware/esp32_mqtt_client/esp32_mqtt_client.ino` bằng Arduino IDE hoặc sử dụng PlatformIO (VS Code).

2. Cập nhật các biến cấu hình ở đầu file (WiFi / MQTT / device id):

```cpp
#define WIFI_SSID    "your_wifi_name"
#define WIFI_PASS    "your_wifi_password"
#define MQTT_HOST    "ip_of_your_server" // ví dụ: 192.168.1.50 hoặc host.docker.internal
#define MQTT_PORT    1883
#define DEVICE_ID    "esp32-001"
```

- Nếu ESP32 và Mosquitto chạy trong Docker trên cùng máy Windows, `host.docker.internal` thường cho phép ESP kết nối tới broker trên máy host. Nếu không, dùng địa chỉ IP của máy host trong mạng LAN.

3. Cài các thư viện cần thiết (Arduino IDE Library Manager) hoặc thêm vào `platformio.ini` khi dùng PlatformIO:

- `PubSubClient`
- `ArduinoJson` (v6)

4. Arduino IDE: chọn **Board > ESP32 Dev Module**, chọn cổng COM đúng, sau đó ấn **Upload**.

   PlatformIO (VS Code): mở project folder `firmware/esp32_mqtt_client` và dùng `PlatformIO: Upload`.

5. Kiểm tra console/serial monitor để xem thiết bị kết nối WiFi, kết nối MQTT và log telemetry/status.

Lưu ý quan trọng về cảm biến và hành vi an toàn:

- Mặc định firmware đọc quang trở (LDR) ở chân `GPIO36` (A0 trên một số board). Nếu bạn sử dụng chân khác, cập nhật `LIGHT_PIN` trong source.
- Pump (bơm) có cơ chế **auto-off 2000 ms** — firmware sẽ tự tắt bơm sau 2 giây bất kể lệnh đến từ automation hay manual. Điều này là an toàn để tránh bơm chạy liên tục; thay đổi hằng số `PUMP_AUTO_OFF_MS` trong source nếu cần.

Chi tiết hơn và các tùy chỉnh khác có trong `firmware/README.md`.

---

## Chạy backend không dùng Docker (development)

Yêu cầu MongoDB và Mosquitto đã chạy sẵn trên máy.

```bash
cd backend/
pip install -r requirements.txt
python manage.py runserver 0.0.0.0:8000
```

Biến môi trường có thể tùy chỉnh:

| Biến                         | Mặc định                   | Mô tả                                                |
| ----------------------------- | ----------------------------- | ------------------------------------------------------ |
| `MONGODB_URI`               | `mongodb://localhost:27017` | MongoDB connection string                              |
| `MONGODB_DB_NAME`           | `plant_monitor`             | Tên database                                          |
| `MQTT_HOST`                 | `localhost`                 | MQTT broker host                                       |
| `MQTT_PORT`                 | `1883`                      | MQTT broker port                                       |
| `AUTOMATION_SOIL_THRESHOLD` | `30`                        | Ngưỡng ẩm đất để bật bơm tự động (%)       |
| `AUTOMATION_TEMP_THRESHOLD` | `18`                        | Ngưỡng nhiệt độ để bật sưởi tự động (°C) |
| `DJANGO_RUN_MQTT`           | `1`                         | Đặt `0` để tắt MQTT listener                    |

---

## API Endpoints

| Method   | URL                                            | Mô tả                                                   |
| -------- | ---------------------------------------------- | --------------------------------------------------------- |
| `GET`  | `/`                                          | Dashboard web UI                                          |
| `GET`  | `/api/overview?deviceId=esp32-001`           | Dữ liệu cảm biến mới nhất + trạng thái thiết bị |
| `GET`  | `/api/history?deviceId=esp32-001&period=day` | Lịch sử cảm biến (`hour`, `day`, `week`)        |
| `GET`  | `/api/events?deviceId=esp32-001`             | 20 lệnh gần nhất (automation + manual)                 |
| `POST` | `/api/command`                               | Gửi lệnh điều khiển thủ công                       |

Ví dụ gửi lệnh bật bơm:

```bash
curl -X POST http://localhost:8000/api/command \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "esp32-001", "pump": true, "light": false, "heater": false}'
```

---

## Automation Rules

Backend tự động xử lý khi nhận telemetry:

| Điều kiện            | Hành động                      |
| ----------------------- | --------------------------------- |
| `soilMoisture < 30%`  | Bật bơm nước (`pump: true`) |
| `temperature < 18°C` | Bật sưởi (`heater: true`)    |

Ngưỡng cấu hình qua biến môi trường `AUTOMATION_SOIL_THRESHOLD` và `AUTOMATION_TEMP_THRESHOLD`.

---

## MongoDB Collections

| Collection        | Mô tả                                               |
| ----------------- | ----------------------------------------------------- |
| `devices`       | Thông tin thiết bị (deviceId, name, lastSeen)      |
| `telemetry`     | Dữ liệu cảm biến theo thời gian                  |
| `device_status` | Trạng thái mới nhất (online, pump, light, heater) |
| `commands`      | Lịch sử lệnh (source: automation / dashboard)      |
| `events`        | Sự kiện cảnh báo (LOW_SOIL_MOISTURE, ...)         |

---

## Xử lý sự cố

### Dashboard hiển thị `--` (không có dữ liệu)

1. **Kiểm tra containers đang chạy**: `docker ps` — phải thấy 3 container
2. **Kiểm tra fake publisher đang chạy** và hiển thị output dữ liệu
3. **Kiểm tra xung đột port MQTT**: Nếu máy đã cài Mosquitto local (Windows Service), nó sẽ chiếm port `1883` trên `127.0.0.1`, khiến fake publisher gửi dữ liệu vào broker sai

   ```powershell
   # Kiểm tra có bao nhiêu process đang listen port 1883
   netstat -ano | findstr "LISTENING" | findstr ":1883"
   ```

   Nếu thấy **2 dòng LISTENING** (ví dụ PID khác nhau), cần dừng Mosquitto local:

   ```powershell
   # Chạy PowerShell với quyền Administrator
   Stop-Service -Name "mosquitto" -Force
   Set-Service -Name "mosquitto" -StartupType Disabled
   ```
4. **Kiểm tra MongoDB có dữ liệu**:

   ```bash
   docker exec plant_mongodb mongosh --quiet --eval "
     db = db.getSiblingDB('plant_monitor');
     print('Telemetry:', db.telemetry.countDocuments({}));
     print('Status:', db.device_status.countDocuments({}));
   "
   ```

### Rebuild sau khi sửa code

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Xem logs

```bash
# Django backend
docker logs plant_django --tail 50

# MQTT broker
docker logs plant_mosquitto --tail 50

# MongoDB
docker logs plant_mongodb --tail 50
```

---

## Hardware Mapping (ESP32)

| Chức năng                       | GPIO   |
| --------------------------------- | ------ |
| Cảm biến độ ẩm đất (YL-69) | GPIO34 |
| Cảm biến nhiệt độ (LM35)     | GPIO35 |
| Relay bơm nước                 | GPIO26 |
| Relay đèn chiếu sáng          | GPIO27 |
| Relay sưởi                      | GPIO25 |

---

## Tech Stack

- **Backend**: Django 5.1, Gunicorn, WhiteNoise
- **Database**: MongoDB 7 (pymongo)
- **MQTT**: Eclipse Mosquitto 2, paho-mqtt
- **Frontend**: HTML, CSS, JavaScript, Chart.js
- **Containerization**: Docker, Docker Compose
- **Firmware**: Arduino (ESP32), PubSubClient, ArduinoJson

Note: this script generates simulated telemetry, including `lightIntensity`. For real photoresistor data, flash `firmware/esp32_mqtt_client/esp32_mqtt_client.ino` on the ESP32 and stop the fake publisher.
