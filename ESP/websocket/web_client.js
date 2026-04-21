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

const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const tempMinInput = document.getElementById("tempMinInput");
const tempMaxInput = document.getElementById("tempMaxInput");
const motionDeltaInput = document.getElementById("motionDeltaInput");
const decisionTimeoutInput = document.getElementById("decisionTimeoutInput");

const chartCanvas = document.getElementById("temperatureChart");
const chartMeta = document.getElementById("chartMeta");
const chartCurrentEl = document.getElementById("chartCurrent");
const chartMinEl = document.getElementById("chartMin");
const chartMaxEl = document.getElementById("chartMax");
const chartHoverInfo = document.getElementById("chartHoverInfo");
const alertList = document.getElementById("alertList");

const toast = document.getElementById("toast");
const decisionModal = document.getElementById("decisionModal");
const decisionTitle = document.getElementById("decisionTitle");
const decisionMessage = document.getElementById("decisionMessage");
const decisionLabel = document.getElementById("decisionLabel");
const decisionYesBtn = document.getElementById("decisionYesBtn");
const decisionNoBtn = document.getElementById("decisionNoBtn");

const defaultSettings = {
  temperatureMin: 24,
  temperatureMax: 30,
  motionDelta: 4,
  decisionTimeoutSec: 10,
};

const MOTION_WINDOW_SIZE = 5;
const MOTION_ALERT_COOLDOWN_MS = 4000;
const STOP_TO_IDLE_DELAY_MS = 650;

const FSM_STATE = {
  IDLE: "IDLE",
  ASK_OPEN: "ASK_OPEN",
  ASK_CLOSE: "ASK_CLOSE",
  OPENING: "OPENING",
  CLOSING: "CLOSING",
  STOP: "STOP",
  MOTION_DETECTED: "MOTION_DETECTED",
};

const FSM_EVENT = {
  TEMP_HIGH: "TEMP_HIGH",
  TEMP_LOW: "TEMP_LOW",
  MOTION_ALERT: "MOTION_ALERT",
  MANUAL_OPEN: "MANUAL_OPEN",
  MANUAL_CLOSE: "MANUAL_CLOSE",
  PROMPT_ACCEPT: "PROMPT_ACCEPT",
  PROMPT_DECLINE: "PROMPT_DECLINE",
  PROMPT_TIMEOUT: "PROMPT_TIMEOUT",
  STOP_COMPLETE: "STOP_COMPLETE",
  ALERT_ACK: "ALERT_ACK",
};

const appState = {
  socket: null,
  settings: { ...defaultSettings },
  fsm: {
    current: FSM_STATE.IDLE,
    previous: null,
  },
  data: {
    temperatureSeries: [],
    alertItems: [],
    distanceHistory: [],
    chartHoverIndex: null,
    chartDataLoaded: false,
    lastMotionAlertAt: 0,
    temperatureZone: "normal",
  },
  timers: {
    pendingDecisionTimer: null,
    motionAckTimer: null,
    stopTimer: null,
  },
  prompt: {
    action: null,
    timeoutSec: 0,
    startedAt: 0,
    message: "",
  },
};

function defaultWebSocketUrl() {
  if (window.location.hostname) {
    return `ws://${window.location.hostname}:8766`;
  }

  return "ws://localhost:8766";
}

function nowTime() {
  return new Date().toLocaleTimeString("vi-VN", { hour12: false });
}

function formatTimeLabel(value) {
  if (typeof value === "string" && /^\d{2}:\d{2}:\d{2}$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value ?? "");
  }

  return date.toLocaleTimeString("vi-VN", { hour12: false });
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function showToast(message, kind = "info") {
  toast.className = `toast show ${kind}`;
  toast.textContent = message;
  window.clearTimeout(showToast.hideTimer);
  showToast.hideTimer = window.setTimeout(() => {
    toast.className = "toast";
  }, 3200);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function loadConfigFromServer() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const config = await response.json();
    appState.settings.temperatureMin = Number.isFinite(Number(config.temperatureMin))
      ? Number(config.temperatureMin)
      : appState.settings.temperatureMin;
    appState.settings.temperatureMax = Number.isFinite(Number(config.temperatureMax))
      ? Number(config.temperatureMax)
      : appState.settings.temperatureMax;
    appState.settings.motionDelta = Number.isFinite(Number(config.motionDelta))
      ? Math.max(0, Number(config.motionDelta))
      : appState.settings.motionDelta;
    appState.settings.decisionTimeoutSec = Number.isFinite(Number(config.decisionTimeoutSec))
      ? Math.max(1, Number(config.decisionTimeoutSec))
      : appState.settings.decisionTimeoutSec;

    if (appState.settings.temperatureMin > appState.settings.temperatureMax) {
      const swap = appState.settings.temperatureMin;
      appState.settings.temperatureMin = appState.settings.temperatureMax;
      appState.settings.temperatureMax = swap;
    }
  } catch (_error) {
    showToast("Không đọc được file config, đang dùng giá trị mặc định.", "warning");
  }

  tempMinInput.value = String(appState.settings.temperatureMin);
  tempMaxInput.value = String(appState.settings.temperatureMax);
  motionDeltaInput.value = String(appState.settings.motionDelta);
  decisionTimeoutInput.value = String(appState.settings.decisionTimeoutSec);
}

async function applySettingsFromInputs() {
  const payload = {
    temperatureMin: Number(tempMinInput.value),
    temperatureMax: Number(tempMaxInput.value),
    motionDelta: Number(motionDeltaInput.value),
    decisionTimeoutSec: Number(decisionTimeoutInput.value),
  };

  try {
    const result = await postJson("/api/config", payload);
    if (!result.ok) {
      throw new Error(result.error || "Save config failed");
    }

    const config = result.config || {};
    appState.settings.temperatureMin = Number(config.temperatureMin);
    appState.settings.temperatureMax = Number(config.temperatureMax);
    appState.settings.motionDelta = Number(config.motionDelta);
    appState.settings.decisionTimeoutSec = Number(config.decisionTimeoutSec);

    tempMinInput.value = String(appState.settings.temperatureMin);
    tempMaxInput.value = String(appState.settings.temperatureMax);
    motionDeltaInput.value = String(appState.settings.motionDelta);
    decisionTimeoutInput.value = String(appState.settings.decisionTimeoutSec);

    redrawTemperatureChart();
    showToast("Đã lưu cấu hình vào file config.json", "success");
    addAlertItem(
      "info",
      "Cập nhật cấu hình",
      `Nhiệt độ [${appState.settings.temperatureMin.toFixed(1)} - ${appState.settings.temperatureMax.toFixed(1)}]°C, cửa sổ chuyển động cố định ${MOTION_WINDOW_SIZE} mẫu, timeout ${appState.settings.decisionTimeoutSec}s.`
    );
  } catch (_error) {
    showToast("Lưu cấu hình thất bại.", "warning");
  }
}

function sendCommand(commandText) {
  if (!appState.socket || appState.socket.readyState !== WebSocket.OPEN) {
    showToast("Chưa kết nối WebSocket.", "warning");
    return;
  }

  appState.socket.send(commandText);
}

function logAlertToServer(alertRecord) {
  postJson("/api/alert", alertRecord).catch(() => {
    // Keep local alerts even if backend write fails.
  });
}

function addAlertItem(kind, title, detail, timestamp = Date.now()) {
  const item = { kind, title, detail, timestamp };
  appState.data.alertItems.unshift(item);
  appState.data.alertItems = appState.data.alertItems.slice(0, 40);
  renderAlerts();
  logAlertToServer(item);
}

function renderAlerts() {
  alertList.innerHTML = appState.data.alertItems
    .map(
      (item) => `
        <li class="alert-item ${escapeHtml(item.kind)}">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.detail)}</span>
          <span>${formatTimeLabel(item.timestamp)}</span>
        </li>
      `
    )
    .join("");
}

function pushTemperaturePoint(value, at = Date.now()) {
  appState.data.temperatureSeries.push({ value, at });
  if (appState.data.temperatureSeries.length > 120) {
    appState.data.temperatureSeries = appState.data.temperatureSeries.slice(-120);
  }

  redrawTemperatureChart();
  chartMeta.textContent = `${appState.data.temperatureSeries.length} điểm dữ liệu`;
}

function redrawTemperatureChart() {
  if (!chartCanvas) {
    return;
  }

  const series = appState.data.temperatureSeries;
  const ctx = chartCanvas.getContext("2d");
  const width = chartCanvas.width;
  const height = chartCanvas.height;
  const padding = 56;

  ctx.clearRect(0, 0, width, height);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(66, 214, 255, 0.16)");
  gradient.addColorStop(1, "rgba(66, 214, 255, 0.02)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + ((height - padding * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  if (series.length < 2) {
    ctx.fillStyle = "rgba(238, 244, 255, 0.75)";
    ctx.font = "24px Sora, sans-serif";
    ctx.fillText("Chưa đủ dữ liệu để vẽ biểu đồ", padding, height / 2);
    chartCurrentEl.textContent = "Hiện tại: --.-°C";
    chartMinEl.textContent = "Thấp nhất: --.-°C";
    chartMaxEl.textContent = "Cao nhất: --.-°C";
    chartHoverInfo.textContent = "Di chuột hoặc chạm để xem chi tiết điểm dữ liệu.";
    return;
  }

  const values = series.map((point) => point.value);
  const observedMin = Math.min(...values);
  const observedMax = Math.max(...values);
  const observedCurrent = values[values.length - 1];

  chartCurrentEl.textContent = `Hiện tại: ${observedCurrent.toFixed(1)}°C`;
  chartMinEl.textContent = `Thấp nhất: ${observedMin.toFixed(1)}°C`;
  chartMaxEl.textContent = `Cao nhất: ${observedMax.toFixed(1)}°C`;

  const minValue = Math.min(...values, appState.settings.temperatureMin);
  const maxValue = Math.max(...values, appState.settings.temperatureMax);
  const span = Math.max(1, maxValue - minValue);
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const xForIndex = (index) => padding + (chartWidth * index) / (series.length - 1);
  const yForValue = (value) => height - padding - ((value - minValue) / span) * chartHeight;

  const minY = yForValue(appState.settings.temperatureMin);
  const maxY = yForValue(appState.settings.temperatureMax);

  ctx.fillStyle = "rgba(86, 240, 192, 0.10)";
  ctx.fillRect(padding, Math.min(minY, maxY), chartWidth, Math.abs(maxY - minY));

  ctx.fillStyle = "rgba(174, 189, 212, 0.9)";
  ctx.font = "18px JetBrains Mono, monospace";
  ctx.fillText(`${maxValue.toFixed(1)}°C`, 12, padding + 6);
  ctx.fillText(`${minValue.toFixed(1)}°C`, 12, height - padding + 6);

  ctx.strokeStyle = "rgba(255, 179, 71, 0.9)";
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(padding, minY);
  ctx.lineTo(width - padding, minY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(padding, maxY);
  ctx.lineTo(width - padding, maxY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "rgba(66, 214, 255, 0.95)";
  ctx.lineWidth = 4;
  ctx.beginPath();

  series.forEach((point, index) => {
    const x = xForIndex(index);
    const y = yForValue(point.value);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevX = xForIndex(index - 1);
      const prevY = yForValue(series[index - 1].value);
      const cpX = (prevX + x) / 2;
      ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
    }
  });

  ctx.stroke();
  ctx.lineTo(xForIndex(series.length - 1), height - padding);
  ctx.lineTo(xForIndex(0), height - padding);
  ctx.closePath();

  const lineArea = ctx.createLinearGradient(0, padding, 0, height - padding);
  lineArea.addColorStop(0, "rgba(66, 214, 255, 0.26)");
  lineArea.addColorStop(1, "rgba(66, 214, 255, 0.02)");
  ctx.fillStyle = lineArea;
  ctx.fill();

  ctx.beginPath();
  series.forEach((point, index) => {
    const x = xForIndex(index);
    const y = yForValue(point.value);
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevX = xForIndex(index - 1);
      const prevY = yForValue(series[index - 1].value);
      const cpX = (prevX + x) / 2;
      ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
    }
  });
  ctx.strokeStyle = "rgba(66, 214, 255, 0.98)";
  ctx.lineWidth = 3;
  ctx.stroke();

  const lastPoint = series[series.length - 1];
  ctx.fillStyle = "#56f0c0";
  ctx.beginPath();
  ctx.arc(xForIndex(series.length - 1), yForValue(lastPoint.value), 6, 0, Math.PI * 2);
  ctx.fill();

  if (appState.data.chartHoverIndex !== null) {
    const safeIndex = Math.max(0, Math.min(series.length - 1, appState.data.chartHoverIndex));
    const hoverPoint = series[safeIndex];
    const hoverX = xForIndex(safeIndex);
    const hoverY = yForValue(hoverPoint.value);

    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(hoverX, padding);
    ctx.lineTo(hoverX, height - padding);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ffb347";
    ctx.beginPath();
    ctx.arc(hoverX, hoverY, 5, 0, Math.PI * 2);
    ctx.fill();

    chartHoverInfo.textContent = `${formatTimeLabel(hoverPoint.at)} • ${hoverPoint.value.toFixed(1)}°C`;
  }
}

function updateChartHoverFromClientX(clientX) {
  if (!chartCanvas || appState.data.temperatureSeries.length < 2) {
    return;
  }

  const rect = chartCanvas.getBoundingClientRect();
  const padding = 56;
  const chartWidth = chartCanvas.width - padding * 2;
  const xOnCanvas = (clientX - rect.left) * (chartCanvas.width / rect.width);
  const ratio = (xOnCanvas - padding) / chartWidth;
  const index = Math.round(ratio * (appState.data.temperatureSeries.length - 1));
  appState.data.chartHoverIndex = Math.max(0, Math.min(appState.data.temperatureSeries.length - 1, index));
  redrawTemperatureChart();
}

async function loadHistoricalData() {
  if (appState.data.chartDataLoaded) {
    return;
  }

  appState.data.chartDataLoaded = true;

  try {
    const [csvResponse, alertsResponse] = await Promise.all([
      fetch("./storage/temperature.csv"),
      fetch("./storage/alerts.json"),
    ]);

    if (csvResponse.ok) {
      const csvText = await csvResponse.text();
      const rows = csvText.trim().split(/\r?\n/).slice(1);
      rows.forEach((row) => {
        const [timestamp, temperature] = row.split(",");
        const value = Number(temperature);
        if (Number.isFinite(value)) {
          const at = timestamp ? Date.parse(timestamp) : Date.now();
          appState.data.temperatureSeries.push({ value, at: Number.isFinite(at) ? at : Date.now() });
        }
      });
      appState.data.temperatureSeries = appState.data.temperatureSeries.slice(-120);
      redrawTemperatureChart();
      chartMeta.textContent = appState.data.temperatureSeries.length
        ? `${appState.data.temperatureSeries.length} điểm dữ liệu`
        : "Chưa có dữ liệu";
    }

    if (alertsResponse.ok) {
      const payload = await alertsResponse.json();
      if (Array.isArray(payload.alerts)) {
        appState.data.alertItems = payload.alerts.slice(-40).reverse();
        renderAlerts();
      }
    }
  } catch (_error) {
    // Keep empty state on first run.
  }
}

function clearDecisionTimer() {
  window.clearInterval(appState.timers.pendingDecisionTimer);
  appState.timers.pendingDecisionTimer = null;
}

function hideDecisionModal() {
  decisionModal.classList.add("hidden");
  clearDecisionTimer();
  appState.prompt.action = null;
}

function renderDecisionPromptText(baseMessage) {
  const elapsedSec = Math.floor((Date.now() - appState.prompt.startedAt) / 1000);
  const remainSec = Math.max(0, appState.prompt.timeoutSec - elapsedSec);
  decisionMessage.textContent = `${baseMessage} Tự động thực hiện sau ${remainSec}s nếu không phản hồi.`;
  return remainSec;
}

function openDecisionModal(options) {
  hideDecisionModal();

  appState.prompt.action = options.action;
  appState.prompt.timeoutSec = options.timeoutSec;
  appState.prompt.startedAt = Date.now();
  appState.prompt.message = options.message;

  decisionLabel.textContent = options.label;
  decisionTitle.textContent = options.title;
  decisionYesBtn.textContent = options.yesText;
  decisionNoBtn.textContent = options.noText;
  decisionModal.classList.remove("hidden");

  renderDecisionPromptText(options.message);

  appState.timers.pendingDecisionTimer = window.setInterval(() => {
    const remainSec = renderDecisionPromptText(options.message);
    if (remainSec <= 0) {
      dispatchFsmEvent(FSM_EVENT.PROMPT_TIMEOUT, { reason: "tự động do hết thời gian phản hồi" });
    }
  }, 1000);
}

function startStopToIdleTimer() {
  window.clearTimeout(appState.timers.stopTimer);
  appState.timers.stopTimer = window.setTimeout(() => {
    dispatchFsmEvent(FSM_EVENT.STOP_COMPLETE);
  }, STOP_TO_IDLE_DELAY_MS);
}

function startMotionAckTimer() {
  window.clearTimeout(appState.timers.motionAckTimer);
  appState.timers.motionAckTimer = window.setTimeout(() => {
    dispatchFsmEvent(FSM_EVENT.ALERT_ACK);
  }, 2500);
}

function transitionTo(nextState) {
  if (appState.fsm.current === nextState) {
    return;
  }

  appState.fsm.previous = appState.fsm.current;
  appState.fsm.current = nextState;
}

function enterState(state, payload = {}) {
  switch (state) {
    case FSM_STATE.ASK_OPEN:
      openDecisionModal({
        label: "NHIỆT ĐỘ CAO",
        title: "Bạn có muốn mở cửa không?",
        message: payload.detail || "Nhiệt độ vượt ngưỡng trên.",
        action: "open",
        timeoutSec: appState.settings.decisionTimeoutSec,
        yesText: "Mở cửa ngay",
        noText: "Không mở",
      });
      break;

    case FSM_STATE.ASK_CLOSE:
      openDecisionModal({
        label: "NHIỆT ĐỘ THẤP",
        title: "Bạn có muốn đóng cửa không?",
        message: payload.detail || "Nhiệt độ thấp hơn ngưỡng dưới.",
        action: "close",
        timeoutSec: appState.settings.decisionTimeoutSec,
        yesText: "Đóng cửa ngay",
        noText: "Không đóng",
      });
      break;

    case FSM_STATE.OPENING:
      hideDecisionModal();
      sendCommand("SERVO:OPEN");
      addAlertItem("info", "FSM OPENING", payload.reason ? `Mở cửa (${payload.reason}).` : "Mở cửa theo FSM.");
      showToast("Đang mở cửa...", "success");
      transitionTo(FSM_STATE.STOP);
      enterState(FSM_STATE.STOP, { reason: "sau OPENING" });
      break;

    case FSM_STATE.CLOSING:
      hideDecisionModal();
      sendCommand("SERVO:CLOSE");
      addAlertItem("info", "FSM CLOSING", payload.reason ? `Đóng cửa (${payload.reason}).` : "Đóng cửa theo FSM.");
      showToast("Đang đóng cửa...", "success");
      transitionTo(FSM_STATE.STOP);
      enterState(FSM_STATE.STOP, { reason: "sau CLOSING" });
      break;

    case FSM_STATE.STOP:
      addAlertItem("info", "FSM STOP", payload.reason ? `Dừng motor (${payload.reason}).` : "Dừng motor.");
      startStopToIdleTimer();
      break;

    case FSM_STATE.MOTION_DETECTED:
      addAlertItem("motion", "FSM MOTION_DETECTED", payload.detail || "Phát hiện thay đổi khoảng cách bất thường.");
      showToast("Phát hiện chuyển động, hãy kiểm tra khu vực cửa.", "warning");
      startMotionAckTimer();
      break;

    case FSM_STATE.IDLE:
      hideDecisionModal();
      break;

    default:
      break;
  }
}

function dispatchFsmEvent(event, payload = {}) {
  const current = appState.fsm.current;

  if (current === FSM_STATE.IDLE) {
    if (event === FSM_EVENT.TEMP_HIGH) {
      transitionTo(FSM_STATE.ASK_OPEN);
      enterState(FSM_STATE.ASK_OPEN, payload);
      return;
    }

    if (event === FSM_EVENT.TEMP_LOW) {
      transitionTo(FSM_STATE.ASK_CLOSE);
      enterState(FSM_STATE.ASK_CLOSE, payload);
      return;
    }

    if (event === FSM_EVENT.MOTION_ALERT) {
      transitionTo(FSM_STATE.MOTION_DETECTED);
      enterState(FSM_STATE.MOTION_DETECTED, payload);
      return;
    }

    if (event === FSM_EVENT.MANUAL_OPEN) {
      transitionTo(FSM_STATE.OPENING);
      enterState(FSM_STATE.OPENING, { reason: "thủ công" });
      return;
    }

    if (event === FSM_EVENT.MANUAL_CLOSE) {
      transitionTo(FSM_STATE.CLOSING);
      enterState(FSM_STATE.CLOSING, { reason: "thủ công" });
    }
    return;
  }

  if (current === FSM_STATE.ASK_OPEN) {
    if (event === FSM_EVENT.PROMPT_ACCEPT || event === FSM_EVENT.PROMPT_TIMEOUT) {
      transitionTo(FSM_STATE.OPENING);
      enterState(FSM_STATE.OPENING, { reason: payload.reason || "xác nhận/tự động" });
      return;
    }

    if (event === FSM_EVENT.PROMPT_DECLINE) {
      transitionTo(FSM_STATE.ASK_CLOSE);
      enterState(FSM_STATE.ASK_CLOSE, {
        detail: "Bạn đã từ chối mở cửa. Hệ thống chuyển sang hỏi đóng cửa theo FSM.",
      });
    }
    return;
  }

  if (current === FSM_STATE.ASK_CLOSE) {
    if (event === FSM_EVENT.PROMPT_ACCEPT || event === FSM_EVENT.PROMPT_TIMEOUT) {
      transitionTo(FSM_STATE.CLOSING);
      enterState(FSM_STATE.CLOSING, { reason: payload.reason || "xác nhận/tự động" });
      return;
    }

    if (event === FSM_EVENT.PROMPT_DECLINE) {
      addAlertItem("info", "FSM", "Người dùng từ chối đóng cửa. Quay lại IDLE.");
      transitionTo(FSM_STATE.IDLE);
      enterState(FSM_STATE.IDLE);
    }
    return;
  }

  if (current === FSM_STATE.STOP) {
    if (event === FSM_EVENT.STOP_COMPLETE) {
      transitionTo(FSM_STATE.IDLE);
      enterState(FSM_STATE.IDLE);
    }
    return;
  }

  if (current === FSM_STATE.MOTION_DETECTED) {
    if (event === FSM_EVENT.ALERT_ACK) {
      transitionTo(FSM_STATE.IDLE);
      enterState(FSM_STATE.IDLE);
    }
  }
}

function evaluateTemperatureByFsm(tempValue) {
  const min = appState.settings.temperatureMin;
  const max = appState.settings.temperatureMax;

  let nextZone = "normal";
  if (tempValue > max) {
    nextZone = "high";
  } else if (tempValue < min) {
    nextZone = "low";
  }

  if (nextZone === appState.data.temperatureZone) {
    return;
  }

  appState.data.temperatureZone = nextZone;

  if (nextZone === "normal") {
    addAlertItem(
      "temp",
      "Nhiệt độ về bình thường",
      `Nhiệt độ ${tempValue.toFixed(1)}°C đã quay lại trong vùng ${min.toFixed(1)} - ${max.toFixed(1)}°C.`
    );
    showToast("Nhiệt độ đã trở về vùng an toàn.", "success");
    return;
  }

  if (nextZone === "high") {
    const detail = `Nhiệt độ ${tempValue.toFixed(1)}°C vượt ngưỡng trên ${max.toFixed(1)}°C.`;
    addAlertItem("temp", "Cảnh báo nhiệt độ cao", detail);
    showToast(detail, "warning");
    dispatchFsmEvent(FSM_EVENT.TEMP_HIGH, { detail });
    return;
  }

  if (nextZone === "low") {
    const detail = `Nhiệt độ ${tempValue.toFixed(1)}°C thấp hơn ngưỡng dưới ${min.toFixed(1)}°C.`;
    addAlertItem("temp", "Cảnh báo nhiệt độ thấp", detail);
    showToast(detail, "warning");
    dispatchFsmEvent(FSM_EVENT.TEMP_LOW, { detail });
  }
}

function evaluateMotionByFsm(distance) {
  const threshold = appState.settings.motionDelta;
  const windowSize = MOTION_WINDOW_SIZE;

  if (appState.data.distanceHistory.length >= windowSize) {
    const recent = appState.data.distanceHistory.slice(-windowSize);
    const baseline = recent.reduce((sum, value) => sum + value, 0) / recent.length;
    const delta = Math.abs(distance - baseline);

    if (delta >= threshold) {
      const now = Date.now();
      if (now - appState.data.lastMotionAlertAt >= MOTION_ALERT_COOLDOWN_MS) {
        appState.data.lastMotionAlertAt = now;
        const detail = `Khoảng cách hiện tại ${distance.toFixed(1)}cm lệch ${delta.toFixed(1)}cm so với trung bình ${baseline.toFixed(1)}cm của ${windowSize} mẫu gần nhất.`;
        dispatchFsmEvent(FSM_EVENT.MOTION_ALERT, { detail });
      }
    }
  }

  appState.data.distanceHistory.push(distance);
  const keep = Math.max(windowSize * 3, 12);
  if (appState.data.distanceHistory.length > keep) {
    appState.data.distanceHistory = appState.data.distanceHistory.slice(-keep);
  }
}

function updateFromMessage(rawMessage) {
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
    const temp = Number(payload.temperature_c ?? payload.temperature ?? payload.temp_c ?? payload.temp);
    if (Number.isFinite(temp)) {
      temperatureValueEl.textContent = `${temp.toFixed(1)} °C`;
      pushTemperaturePoint(temp);
      evaluateTemperatureByFsm(temp);
    }

    const distance = Number(payload.distance_cm ?? payload.distance);
    if (Number.isFinite(distance) && distance >= 0) {
      distanceValueEl.textContent = `${distance.toFixed(1)} cm`;
      evaluateMotionByFsm(distance);
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
    appState.socket = new WebSocket(url);
  } catch (_error) {
    setStatus(false);
    showToast("Không tạo được kết nối WebSocket.", "warning");
    return;
  }

  appState.socket.onopen = () => {
    setStatus(true);
    showToast("Kết nối WebSocket thành công.", "success");
  };

  appState.socket.onmessage = (event) => {
    updateFromMessage(String(event.data));
  };

  appState.socket.onerror = () => {
    setStatus(false);
    showToast("Kết nối WebSocket gặp lỗi.", "warning");
  };

  appState.socket.onclose = () => {
    setStatus(false);
    appState.socket = null;
  };
}

function disconnectSocket() {
  if (appState.socket && (appState.socket.readyState === WebSocket.OPEN || appState.socket.readyState === WebSocket.CONNECTING)) {
    appState.socket.close(1000, "Client requested disconnect");
  }
}

function openDoor() {
  dispatchFsmEvent(FSM_EVENT.MANUAL_OPEN);
}

function closeDoor() {
  dispatchFsmEvent(FSM_EVENT.MANUAL_CLOSE);
}

connectBtn.addEventListener("click", connectSocket);
disconnectBtn.addEventListener("click", disconnectSocket);
openDoorBtn.addEventListener("click", openDoor);
closeDoorBtn.addEventListener("click", closeDoor);
saveSettingsBtn.addEventListener("click", applySettingsFromInputs);

decisionYesBtn.addEventListener("click", () => {
  dispatchFsmEvent(FSM_EVENT.PROMPT_ACCEPT, { reason: "người dùng xác nhận" });
});

decisionNoBtn.addEventListener("click", () => {
  dispatchFsmEvent(FSM_EVENT.PROMPT_DECLINE, { reason: "người dùng từ chối" });
});

decisionModal.addEventListener("click", (event) => {
  if (event.target === decisionModal) {
    dispatchFsmEvent(FSM_EVENT.PROMPT_DECLINE, { reason: "đóng modal" });
  }
});

if (!wsUrlInput.value.trim() || wsUrlInput.value.trim() === "ws://localhost:8766") {
  wsUrlInput.value = defaultWebSocketUrl();
  wsUrlInput.placeholder = defaultWebSocketUrl();
}

chartCanvas.addEventListener("mousemove", (event) => {
  updateChartHoverFromClientX(event.clientX);
});

chartCanvas.addEventListener("mouseleave", () => {
  appState.data.chartHoverIndex = null;
  chartHoverInfo.textContent = "Di chuột hoặc chạm để xem chi tiết điểm dữ liệu.";
  redrawTemperatureChart();
});

chartCanvas.addEventListener("touchmove", (event) => {
  if (!event.touches || event.touches.length === 0) {
    return;
  }
  updateChartHoverFromClientX(event.touches[0].clientX);
}, { passive: true });

(async function init() {
  setStatus(false);
  updatedAtEl.textContent = "--:--:--";
  servoValueEl.textContent = "-- deg";
  chartMeta.textContent = "Đang tải dữ liệu...";

  await loadConfigFromServer();
  await loadHistoricalData();
  redrawTemperatureChart();

  if (!appState.data.temperatureSeries.length) {
    chartMeta.textContent = "Chưa có dữ liệu";
  }

  transitionTo(FSM_STATE.IDLE);
})();
