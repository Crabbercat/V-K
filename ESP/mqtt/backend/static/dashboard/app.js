const deviceId = "esp32-001";
let currentPeriod = "day";

const STATE_IDS = ["pumpVal", "lightVal", "heaterVal"];

const tempCtx = document.getElementById("tempChart").getContext("2d");
const soilCtx = document.getElementById("soilChart").getContext("2d");

const tempChart = new Chart(tempCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Temperature (C)",
      data: [],
      borderColor: "#d04b29",
      backgroundColor: "rgba(208, 75, 41, 0.12)",
      fill: true,
      tension: 0.32,
      pointRadius: 0,
    }]
  },
  options: { responsive: true, animation: false }
});

const soilChart = new Chart(soilCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Soil Moisture (%)",
      data: [],
      borderColor: "#007a63",
      backgroundColor: "rgba(0, 122, 99, 0.12)",
      fill: true,
      tension: 0.32,
      pointRadius: 0,
    }]
  },
  options: { responsive: true, animation: false }
});

function setStateText(id, value) {
  const node = document.getElementById(id);
  const on = Boolean(value);
  node.textContent = on ? "ON" : "OFF";
  node.classList.remove("on", "off");
  node.classList.add(on ? "on" : "off");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function updateGauges(temp, soil) {
  const tempValue = temp == null ? 0 : Math.max(0, Math.min(40, temp));
  const soilValue = soil == null ? 0 : Math.max(0, Math.min(100, soil));

  document.getElementById("tempGaugeText").textContent = temp == null ? "-- C" : `${temp.toFixed(1)} C`;
  document.getElementById("soilGaugeText").textContent = soil == null ? "-- %" : `${Math.round(soil)} %`;
  document.getElementById("tempGaugeBar").style.width = `${(tempValue / 40) * 100}%`;
  document.getElementById("soilGaugeBar").style.width = `${soilValue}%`;
}

function updateFreshness(timestamp) {
  const badge = document.getElementById("liveBadge");
  if (!timestamp) {
    badge.textContent = "No data";
    badge.classList.add("stale");
    return;
  }

  const ageMs = Date.now() - new Date(timestamp).getTime();
  const stale = !Number.isFinite(ageMs) || ageMs > 120000;
  badge.textContent = stale ? "Stale" : "Live";
  badge.classList.toggle("stale", stale);
}

async function refreshOverview() {
  const res = await fetch(`/api/overview?deviceId=${deviceId}`);
  if (!res.ok) {
    return;
  }

  const data = await res.json();
  const temp = toNumber(data.temperature);
  const soil = toNumber(data.soilMoisture);

  document.getElementById("deviceLabel").textContent = data.deviceId || deviceId;
  document.getElementById("tempVal").textContent = temp == null ? "--" : `${temp.toFixed(1)} C`;
  document.getElementById("soilVal").textContent = soil == null ? "--" : `${Math.round(soil)} %`;

  setStateText("pumpVal", data.pump);
  setStateText("lightVal", data.light);
  setStateText("heaterVal", data.heater);

  updateGauges(temp, soil);
  updateFreshness(data.timestamp);
}

async function refreshHistory() {
  const res = await fetch(`/api/history?deviceId=${deviceId}&period=${currentPeriod}`);
  if (!res.ok) {
    return;
  }

  const data = await res.json();

  const labels = data.items.map((x) => new Date(x.timestamp).toLocaleTimeString());
  const tempData = data.items.map((x) => x.temperature);
  const soilData = data.items.map((x) => x.soilMoisture);

  tempChart.data.labels = labels;
  tempChart.data.datasets[0].data = tempData;
  tempChart.update();

  soilChart.data.labels = labels;
  soilChart.data.datasets[0].data = soilData;
  soilChart.update();
}

async function refreshEvents() {
  const res = await fetch(`/api/events?deviceId=${deviceId}`);
  if (!res.ok) {
    return;
  }

  const data = await res.json();
  const list = document.getElementById("timeline");
  list.innerHTML = "";

  if (!data.items || data.items.length === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "No activity yet.";
    list.appendChild(li);
    return;
  }

  data.items.forEach((item) => {
    const li = document.createElement("li");
    const line1 = document.createElement("strong");
    line1.textContent = `Pump ${item.pump ? "ON" : "OFF"} | Light ${item.light ? "ON" : "OFF"} | Heater ${item.heater ? "ON" : "OFF"}`;

    const line2 = document.createElement("small");
    line2.textContent = `${new Date(item.timestamp).toLocaleString()} - source: ${item.source}`;

    li.appendChild(line1);
    li.appendChild(line2);
    list.appendChild(li);
  });
}

async function sendCommand(event) {
  event.preventDefault();
  const form = event.target;
  const payload = {
    deviceId,
    pump: form.pump.checked,
    light: form.light.checked,
    heater: form.heater.checked,
  };

  await fetch("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  await Promise.all([refreshEvents(), refreshOverview()]);
}

function bindControls() {
  document.querySelectorAll(".periods button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".periods button").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      currentPeriod = btn.dataset.period;
      await refreshHistory();
    });
  });

  document.getElementById("commandForm").addEventListener("submit", sendCommand);
}

async function tick() {
  await Promise.all([refreshOverview(), refreshEvents()]);
}

bindControls();
Promise.all([tick(), refreshHistory()]);
setInterval(tick, 5000);

STATE_IDS.forEach((id) => {
  const node = document.getElementById(id);
  node.classList.add("off");
});
