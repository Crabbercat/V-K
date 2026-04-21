const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const openDoorBtn = document.getElementById("openDoorBtn");
const closeDoorBtn = document.getElementById("closeDoorBtn");

const wsUrlInput = document.getElementById("wsUrl");

const connectionStatus = document.getElementById("connectionStatus");
const temperatureLabelEl = document.getElementById("temperatureLabel");
const temperatureValueEl = document.getElementById("temperatureValue");
const distanceLabelEl = document.getElementById("distanceLabel");
const distanceValueEl = document.getElementById("distanceValue");
const servoLabelEl = document.getElementById("servoLabel");
const servoValueEl = document.getElementById("servoValue");
const updatedAtEl = document.getElementById("updatedAt");

let socket = null;

function defaultWebSocketUrl() {
  if (window.location.hostname) {
    return `ws://${window.location.hostname}:8766`;
  }

  return "ws://localhost:8766";
}

function nowTime() {
  return new Date().toLocaleTimeString("vi-VN", { hour12: false });
}

function setStatus(online) {
  connectionStatus.textContent = online ? "Trực tuyến" : "Ngoại tuyến";
  connectionStatus.classList.toggle("status-online", online);
  connectionStatus.classList.toggle("status-offline", !online);
  document.body.classList.toggle("is-online", online);

  connectBtn.disabled = online;
  disconnectBtn.disabled = !online;
  openDoorBtn.disabled = !online;
  closeDoorBtn.disabled = !online;
}

function sendCommand(commandText) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(commandText);
}

function updateFromMessage(rawMessage) {
  const plainTextMatch = rawMessage.match(/(?:temperature|temp|nhiệt\s*độ|nhiet\s*do)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  if (plainTextMatch) {
    const plainTemp = Number(plainTextMatch[1]);
    if (Number.isFinite(plainTemp)) {
      temperatureValueEl.textContent = `${plainTemp.toFixed(1)} °C`;
      updatedAtEl.textContent = nowTime();
    }
  }

  const plainDistanceMatch = rawMessage.match(/(?:distance|khoảng\s*cách|khoang\s*cach)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  if (plainDistanceMatch) {
    const plainDistance = Number(plainDistanceMatch[1]);
    if (Number.isFinite(plainDistance) && plainDistance >= 0) {
      distanceValueEl.textContent = `${plainDistance.toFixed(1)} cm`;
      updatedAtEl.textContent = nowTime();
    }
  }

  const jsonStart = rawMessage.indexOf("{");
  if (jsonStart < 0) {
    return;
  }

  let payload = null;
  try {
    payload = JSON.parse(rawMessage.slice(jsonStart));
  } catch (_error) {
    return;
  }

  if (!payload || typeof payload !== "object") {
    return;
  }

  const sensorName = String(payload.sensor ?? payload.type ?? "").toLowerCase();
  const allowSensor = sensorName === "" || sensorName.includes("temp") || sensorName.includes("environment") || sensorName.includes("distance");
  if (allowSensor) {
    const temp = Number(
      payload.temperature_c ?? payload.temperature ?? payload.temp_c ?? payload.temp
    );
    if (Number.isFinite(temp)) {
      temperatureValueEl.textContent = `${temp.toFixed(1)} °C`;
    }

    const distance = Number(payload.distance_cm ?? payload.distance);
    if (Number.isFinite(distance) && distance >= 0) {
      distanceValueEl.textContent = `${distance.toFixed(1)} cm`;
    } else if (Number.isFinite(distance) && distance < 0) {
      distanceValueEl.textContent = "Quá thời gian phản hồi";
    }

    if (Number.isFinite(Number(payload.temperature_pin ?? payload.pin))) {
      temperatureLabelEl.textContent = `Nhiệt độ LM35 (chân ${payload.temperature_pin ?? payload.pin})`;
    }

    if (Number.isFinite(Number(payload.hcsr04_trig)) && Number.isFinite(Number(payload.hcsr04_echo))) {
      distanceLabelEl.textContent = `Khoảng cách HC-SR04 (TRIG ${payload.hcsr04_trig}, ECHO ${payload.hcsr04_echo})`;
    }
  }

  const servoAngle = Number(payload.servo_angle);
  if (Number.isFinite(servoAngle)) {
    servoValueEl.textContent = `${servoAngle.toFixed(0)} deg`;
  }

  const servoState = String(payload.servo_state ?? "").toLowerCase();
  if (servoState === "open" || servoState === "closed") {
    servoLabelEl.textContent = servoState === "open" ? "Servo cửa (đang mở)" : "Servo cửa (đang đóng)";
  }

  updatedAtEl.textContent = nowTime();
}

function connectSocket() {
  const url = wsUrlInput.value.trim();
  if (!url) {
    return;
  }

  try {
    socket = new WebSocket(url);
  } catch (error) {
    setStatus(false);
    return;
  }

  socket.onopen = () => {
    setStatus(true);
  };

  socket.onmessage = (event) => {
    const data = String(event.data);
    updateFromMessage(data);
  };

  socket.onerror = () => {
    setStatus(false);
  };

  socket.onclose = () => {
    setStatus(false);
    socket = null;
  };
}

function disconnectSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    socket.close(1000, "Client requested disconnect");
  }
}

function openDoor() {
  sendCommand("SERVO:OPEN");
}

function closeDoor() {
  sendCommand("SERVO:CLOSE");
}

connectBtn.addEventListener("click", connectSocket);
disconnectBtn.addEventListener("click", disconnectSocket);
openDoorBtn.addEventListener("click", openDoor);
closeDoorBtn.addEventListener("click", closeDoor);

if (!wsUrlInput.value.trim() || wsUrlInput.value.trim() === "ws://localhost:8766") {
  wsUrlInput.value = defaultWebSocketUrl();
  wsUrlInput.placeholder = defaultWebSocketUrl();
}

setStatus(false);
updatedAtEl.textContent = "--:--:--";
servoValueEl.textContent = "-- deg";
