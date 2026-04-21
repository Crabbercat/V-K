# He thong IoT don gian: ESP32 + WebSocket + Web Dashboard

Tai lieu nay dung de ban quay lai nhin nhanh:
- Muc tieu du an
- Trang thai hien tai da lam den dau
- Viec nao da xong, viec nao chua
- Huong tiep theo de hoan thien he thong cua tu dong (servo)

## 1) Muc tieu du an

Xay dung mot he thong IoT don gian co kha nang:
1. Thu thap du lieu tu 2 cam bien:
	 - LM35 (nhiet do)
	 - HC-SR04 (khoang cach)
2. Gui du lieu thoi gian thuc tu ESP32 den nguoi dung qua WebSocket.
3. Hien thi du lieu tren giao dien web (dashboard).
4. Dieu khien servo SG90 de mo/dong cua.
5. Sau cung, bo sung che do tu dong dong/mo cua theo dieu kien cam bien.

## 2) Kien truc hien tai

Luong du lieu dang hoat dong:
1. ESP32 doc LM35 + HC-SR04.
2. ESP32 gui JSON qua WebSocket den server Python tren PC.
3. Server Python phat lai du lieu cho cac client khac.
4. Web client nhan du lieu va cap nhat giao dien theo thoi gian thuc.

Thanh phan trong thu muc nay:
- esp_websocket_client/esp_websocket_client.ino
	- Firmware chinh dang dung.
	- Da co WiFi + WebSocket + doc LM35 + doc HC-SR04 + dieu khien servo.
	- Da gui JSON dinh ky va nhan lenh SERVO:OPEN / SERVO:CLOSE.
	- pc_ws_server.py
	- WebSocket server tren PC.
	- Port 8765: ESP gui du lieu vao.
	- Port 8766: web client ket noi vao de nhan du lieu va gui lenh.
		- Port 8000: frontend HTTP de mo UI tren bat ky thiet bi nao trong LAN.
	- Co role infer co ban (ESP/WEB), echo lai cho sender va broadcast cho client khac.
	- storage/
		- temperature.csv: log nhiet do va khoang cach tu ESP.
		- alerts.json: log cac canh bao va su kien tu giao dien.
		- config.json: nguong nhiet do, tham so canh bao chuyen dong, timeout tu dong.
- web_client.html + web_client.css + web_client.js
	- Dashboard web theo doi trang thai ket noi.
		- Hien thi nhiet do, khoang cach, servo va nut dieu khien dong/mo.
		- Co setting nguong nhiet do, nguong/cua so chuyen dong va timeout phan hoi.
		- Co modal hoi mo/ dong cua khi nhiet do ra ngoai khoang cai dat.
		- Neu khong phan hoi trong 10 giay (hoac timeout cai dat), he thong tu dong thuc hien.
		- Co canh bao chuyen dong, danh sach su kien va bieu do duong nhiet do.
- esp_websocket_client/sg90_test.ino
	- Test servo SG90 quay qua lai (test rieng, chua tich hop vao firmware chinh).
- esp_websocket_client/lm35_d02_test.ino
	- Test LM35 rieng.
- esp_websocket_client/hcsr04_test.ino
	- Test HC-SR04 rieng.

## 3) Tien do hien tai

### 3.1 Phan da hoan thanh

	- Da co ket noi WiFi tren ESP32.
	- Da co ket noi WebSocket ESP32 -> Python server.
	- Da doc duoc LM35 va HC-SR04 tren ESP32.
	- Da dong goi du lieu theo JSON va gui dinh ky moi 1 giay.
	- Da co web dashboard hien thi:
	- Trang thai online/offline
	- Gia tri nhiet do
	- Gia tri khoang cach
		- Gia tri servo va trang thai open/closed
	- Thoi diem cap nhat cuoi
	- Da co sketch test servo SG90 doc lap de kiem tra phan cung.

### 3.2 Phan chua hoan thanh

	- Chua co co che tu dong dong/mo cua theo nguong cam bien.
	- Chua co co che mode (MANUAL/AUTO) va uu tien an toan khi ra lenh.
	- Chua co luu lich su du lieu hoac canh bao su kien.

### 3.3 Danh gia tong quan

Tien do tong the hien tai (uoc luong):
- Khoang 80% cho muc tieu he thong IoT ban dau.

Ly do:
- Data pipeline realtime da on (cam bien -> websocket -> web).
- Phan quan trong con lai la control pipeline (web/server -> ESP -> servo) va auto-rule.

## 4) Dinh dang du lieu dang gui

ESP dang gui payload JSON dang:

{
	"device": "esp32",
	"sensor": "environment",
	"temperature_pin": 35,
	"temperature_c": 30.12,
	"distance_cm": 24.50,
	"hcsr04_trig": 5,
	"hcsr04_echo": 18
}

Ghi chu:
- Neu HC-SR04 timeout, distance_cm co the mang gia tri am (vi du -1).
- Web client da co xu ly truong hop timeout va hien thong bao phu hop.

## 5) Cach chay he thong hien tai

### 5.1 Chay server tren PC

1. Cai dependency:

	 pip install -r requirements.txt

2. Chay server:

	 python pc_ws_server.py

3. Ket qua mong doi:
- Server lang nghe tai ws://0.0.0.0:8765 va ws://0.0.0.0:8766
- Frontend mo tai http://0.0.0.0:8000/

### 5.2 Nap firmware cho ESP32

1. Mo file esp_websocket_client/esp_websocket_client.ino trong Arduino IDE.
2. Cai thu vien WebSockets (Markus Sattler).
3. Cai them thu vien ESP32Servo.
4. Sua thong tin:
- WIFI_SSID
- WIFI_PASS
- WS_HOST (IP local cua may PC chay server)
5. Chon board ESP32 va nap code.
6. Mo Serial Monitor baud 115200 de theo doi log.

### 5.3 Mo dashboard

1. Mo file web_client.html tren trinh duyet.
2. Hoac mo tu dien thoai/may khac bang URL: http://<IP_MAY_PC>:8000/
3. Trang web se tu lay WebSocket host theo IP hien tai va dung port 8766.
4. Bam Ket noi.
5. Chinh cac o setting neu can.
6. Dung nut Mo cua / Dong cua de gui lenh servo.
7. Quan sat du lieu nhiet do/khoang cach/servo realtime, bieu do va canh bao.

### 5.4 Luu tru du lieu

- Nhiet do va khoang cach tu ESP se duoc ghi vao storage/temperature.csv.
- Cac canh bao/nhat ky su kien tu giao dien se duoc ghi vao storage/alerts.json.
- Cac tham so canh bao duoc luu trong storage/config.json.
- Neu muon xem file log truc tiep, mo theo duong dan HTTP cung host: http://<IP_MAY_PC>:8000/storage/temperature.csv va http://<IP_MAY_PC>:8000/storage/alerts.json va http://<IP_MAY_PC>:8000/storage/config.json.

## 6) Luat ky thuat quan trong

- LM35 tren ESP32 nen uu tien ADC1 (GPIO32/33/34/35/36/39) de on dinh khi WiFi bat.
- GPIO2/GPIO4 thuoc ADC2 co the dao dong gia tri khi WiFi hoat dong.
- HC-SR04 can cap nguon dung va day mass chung voi ESP32.
- ESP va PC phai cung mang LAN neu dung WS_HOST la IP noi bo.
- Mo firewall neu Python bi chan cong 8765 hoac 8766.

## 7) Ke hoach tiep theo (de dat muc tieu cua tu dong)

Uu tien de xong theo thu tu sau:

1. Bo sung logic tu dong dong/mo cua theo cam bien
- Dung khoang cach lam dieu kien kich hoat.
- Them hysteresis de tranh servo dao dong lien tuc.

2. Nang cap dashboard
- The hien nhat ky theo nhom su kien ro rang hon.
- Neu can, them loc thoi gian cho bieu do va canh bao.

3. Hoan thien kenh lenh dieu khien servo qua WebSocket
- Dinh nghia message command, vi du:
	{"cmd":"door","mode":"manual","action":"open"}
	{"cmd":"door","mode":"manual","action":"close"}

4. Them mode MANUAL/AUTO va uu tien an toan
- Manual command co the tam thoi override auto.
- Neu mat du lieu cam bien hoac timeout dai -> ve trang thai an toan (dong cua).

## 8) Checklist trien khai

- [x] WebSocket server Python
- [x] ESP gui data LM35
- [x] ESP gui data HC-SR04
- [x] Web dashboard hien thi data realtime
- [x] Servo tich hop vao firmware chinh
- [x] Web command -> ESP servo control
- [x] Auto open/close theo dieu kien cam bien
- [ ] Mode MANUAL/AUTO
- [x] Log su kien va canh bao

## 9) Moc cap nhat gan nhat

Trang thai cap nhat gan nhat trong thu muc nay:
- Pipeline cam bien realtime da chay thong.
- Servo da co the dieu khien tu web qua WebSocket.
- Muc tieu tiep theo ro rang: bo sung auto-rule cho dong/mo cua.

Neu ban quay lai du an sau mot thoi gian, hay bat dau tu muc 7 va muc 8 de tiep tuc dung thu tu va de theo doi tien do.


Các trạng thái chính
1. IDLE (trạng thái chờ)
Chức năng:
Đọc:
Khoảng cách
Nhiệt độ
Trạng thái servo
Chuyển trạng thái:
T > Tmax → ASK_OPEN
T < Tmin → ASK_CLOSE
Có thay đổi khoảng cách bất thường → MOTION_DETECTED
User click open → OPENING
User click close → CLOSING
2. ASK_OPEN (hỏi mở cửa)
Chức năng:
Gửi yêu cầu mở cửa
Bắt đầu timeout
Chờ phản hồi người dùng
Chuyển:
User accept hoặc timeout → OPENING
User decline → ASK_CLOSE
3. ASK_CLOSE (hỏi đóng cửa)
Chức năng:
Gửi yêu cầu đóng cửa
Bắt đầu timeout
Chờ phản hồi
Chuyển:
User accept hoặc timeout → CLOSING
User decline → IDLE
4. OPENING (đang mở cửa)
Chức năng:
Motor quay thuận (mở)
Theo dõi vị trí
Dừng khi mở hoàn toàn
Chuyển:
Fully open → STOP
5. CLOSING (đang đóng cửa)
Chức năng:
Motor quay ngược (đóng)
Theo dõi vị trí
Dừng khi đóng hoàn toàn
Chuyển:
Fully close → STOP
6. STOP (dừng motor)
Chức năng:
Ngắt motor
Chuyển:
Sau khi dừng → quay về IDLE
7. MOTION_DETECTED (phát hiện chuyển động)
Chức năng:
Phát hiện khoảng cách bất thường
Kích hoạt cảnh báo / an toàn
Chuyển:
User close alert → quay về IDLE