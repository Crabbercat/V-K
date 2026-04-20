const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");

const wsUrlInput = document.getElementById("wsUrl");

const connectionStatus = document.getElementById("connectionStatus");
const temperatureLabelEl = document.getElementById("temperatureLabel");
const temperatureValueEl = document.getElementById("temperatureValue");
const distanceLabelEl = document.getElementById("distanceLabel");
const distanceValueEl = document.getElementById("distanceValue");
const updatedAtEl = document.getElementById("updatedAt");

let socket = null;

function tryUpdateTemperature(rawMessage) {
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

  let payloadText = rawMessage;
  const jsonStart = rawMessage.indexOf("{");
  if (jsonStart > 0) {
    payloadText = rawMessage.slice(jsonStart);
  }

  let payload = null;

  try {
    payload = JSON.parse(payloadText);
  } catch (_error) {
    return;
  }

  if (!payload) {
    return;
  }

  const sensorName = String(payload.sensor ?? payload.type ?? "").toLowerCase();
  const allowSensor = sensorName === "" || sensorName.includes("temp") || sensorName.includes("environment") || sensorName.includes("distance");
  if (!allowSensor) {
    return;
  }

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

  updatedAtEl.textContent = nowTime();
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
    tryUpdateTemperature(data);
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

connectBtn.addEventListener("click", connectSocket);
disconnectBtn.addEventListener("click", disconnectSocket);

setStatus(false);
updatedAtEl.textContent = "--:--:--";
