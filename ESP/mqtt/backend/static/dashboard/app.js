/* ============================================================
   Indoor Plant Support System — Dashboard Logic
   ============================================================ */

const deviceId = "esp32-001";
let currentPeriod = "day";

/* ─── Chart.js Defaults ─── */
Chart.defaults.color = "#4d6b5c";
Chart.defaults.borderColor = "rgba(255, 255, 255, 0.03)";
Chart.defaults.font.family = "'Space Grotesk', system-ui, sans-serif";

const tempCtx = document.getElementById("tempChart").getContext("2d");
const soilCtx = document.getElementById("soilChart").getContext("2d");
const luxCtx  = document.getElementById("luxChart").getContext("2d");

function makeGradient(ctx, r, g, b) {
  const grad = ctx.createLinearGradient(0, 0, 0, 260);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.18)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0.01)`);
  return grad;
}

const chartOpts = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { intersect: false, mode: "index" },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: "rgba(10, 21, 18, 0.92)",
      borderColor: "rgba(255,255,255,0.06)",
      borderWidth: 1,
      padding: 8,
      cornerRadius: 8,
      titleFont: { weight: 600, size: 11 },
      bodyFont: { size: 11 },
    },
  },
  scales: {
    x: {
      grid: { color: "rgba(255,255,255,0.02)", drawBorder: false },
      ticks: { maxTicksLimit: 6, font: { size: 9 } },
    },
    y: {
      grid: { color: "rgba(255,255,255,0.02)", drawBorder: false },
      ticks: { font: { size: 9 } },
    },
  },
};

const tempChart = new Chart(tempCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Temp (°C)",
      data: [],
      borderColor: "#FF8A65",
      backgroundColor: makeGradient(tempCtx, 255, 138, 101),
      fill: true, tension: 0.4,
      pointRadius: 0, pointHoverRadius: 3,
      pointHoverBackgroundColor: "#FF8A65",
      borderWidth: 2,
    }],
  },
  options: chartOpts,
});

const soilChart = new Chart(soilCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Moisture (%)",
      data: [],
      borderColor: "#2ECC71",
      backgroundColor: makeGradient(soilCtx, 46, 204, 113),
      fill: true, tension: 0.4,
      pointRadius: 0, pointHoverRadius: 3,
      pointHoverBackgroundColor: "#2ECC71",
      borderWidth: 2,
    }],
  },
  options: chartOpts,
});

const luxChart = new Chart(luxCtx, {
  type: "line",
  data: {
    labels: [],
    datasets: [{
      label: "Light (lux)",
      data: [],
      borderColor: "#FDD835",
      backgroundColor: makeGradient(luxCtx, 253, 216, 53),
      fill: true, tension: 0.4,
      pointRadius: 0, pointHoverRadius: 3,
      pointHoverBackgroundColor: "#FDD835",
      borderWidth: 2,
    }],
  },
  options: chartOpts,
});

/* ─── Helpers ─── */
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

function statusOf(val, type) {
  if (val == null) return { label: "--", cls: "optimal" };
  if (type === "temp") {
    if (val >= 18 && val <= 30) return { label: "Optimal ✔", cls: "optimal" };
    if (val >= 15 && val <= 35) return { label: "Warning ⚠", cls: "warning" };
    return { label: "Critical ❌", cls: "critical" };
  }
  if (type === "moisture") {
    if (val >= 50 && val <= 80) return { label: "Optimal ✔", cls: "optimal" };
    if (val >= 30 && val <= 90) return { label: "Warning ⚠", cls: "warning" };
    return { label: "Critical ❌", cls: "critical" };
  }
  if (type === "light") {
    if (val >= 500 && val <= 1500) return { label: "Optimal ✔", cls: "optimal" };
    if (val >= 200 && val <= 2000) return { label: "Warning ⚠", cls: "warning" };
    return { label: "Critical ❌", cls: "critical" };
  }
  return { label: "Optimal ✔", cls: "optimal" };
}

function setTag(id, info) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = info.label;
  el.className = "status-tag " + info.cls;
}

/* ─── AI Feed ─── */
function buildFeed(temp, soil, lux, lightOn, pumpOn) {
  const items = [];
  const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (soil != null && soil < 40) {
    items.push({ dot: "warn", text: `Moisture is low (${Math.round(soil)}%). Watering recommended.`, time: t });
  } else if (soil != null && soil > 85) {
    items.push({ dot: "warn", text: `Soil very wet (${Math.round(soil)}%). Reduce watering.`, time: t });
  } else if (soil != null) {
    items.push({ dot: "good", text: `Moisture healthy at ${Math.round(soil)}%.`, time: t });
  }

  if (temp != null && temp < 16) {
    items.push({ dot: "bad", text: `Cold (${temp.toFixed(1)}°C). Consider heater.`, time: t });
  } else if (temp != null && temp > 32) {
    items.push({ dot: "bad", text: `Hot (${temp.toFixed(1)}°C). Improve ventilation.`, time: t });
  } else if (temp != null) {
    items.push({ dot: "good", text: `Temperature OK at ${temp.toFixed(1)}°C.`, time: t });
  }

  if (lux != null) {
    if (lux < 200)       items.push({ dot: "warn", text: `Light too low (${Math.round(lux)} lux).`, time: t });
    else if (lux > 2000) items.push({ dot: "warn", text: `Light very bright (${Math.round(lux)} lux).`, time: t });
    else                 items.push({ dot: "good", text: `Light good at ${Math.round(lux)} lux.`, time: t });
  } else if (!lightOn) {
    items.push({ dot: "info", text: "Grow light is off.", time: t });
  }

  if (items.length === 0) {
    items.push({ dot: "good", text: "All systems healthy 🌿", time: t });
  }

  return items;
}

function renderFeed(items) {
  const el = document.getElementById("aiFeed");
  if (!el) return;
  el.innerHTML = "";
  items.forEach((it) => {
    const div = document.createElement("div");
    div.className = "ai-item";
    div.innerHTML = `<div class="ai-dot ${it.dot}"></div><div><p>${it.text}</p><small>${it.time}</small></div>`;
    el.appendChild(div);
  });
}

/* ─── Overall Health Badge ─── */
function updateHeroBadge(temp, soil, lux) {
  const el = document.getElementById("overallHealth");
  if (!el) return;
  let bad = false, warn = false;
  if (temp != null && (temp < 15 || temp > 35)) bad = true;
  if (soil != null && (soil < 30 || soil > 90)) bad = true;
  if (temp != null && (temp < 18 || temp > 30)) warn = true;
  if (soil != null && (soil < 50 || soil > 80)) warn = true;
  if (lux != null && (lux < 200 || lux > 2000)) warn = true;
  if (bad)       { el.className = "hero-badge bad";  el.textContent = "❌ Critical — act now"; }
  else if (warn) { el.className = "hero-badge warn"; el.textContent = "⚠ Needs attention"; }
  else           { el.className = "hero-badge good"; el.textContent = "✔ All systems healthy"; }
}

function updateFreshness(ts) {
  const badge = document.getElementById("liveBadge");
  const conn = document.getElementById("connectionStatus");
  if (!ts) {
    badge.textContent = "Offline";
    badge.classList.add("stale");
    if (conn) { conn.textContent = "Offline"; conn.style.color = "var(--danger)"; }
    return;
  }
  const age = Date.now() - new Date(ts).getTime();
  const stale = !Number.isFinite(age) || age > 120000;
  badge.textContent = stale ? "Stale" : "Live";
  badge.classList.toggle("stale", stale);
  if (conn) {
    conn.textContent = stale ? "Stale" : "Connected";
    conn.style.color = stale ? "var(--warning)" : "var(--green)";
  }
}

/* ─── API: Overview ─── */
async function refreshOverview() {
  try {
    const res = await fetch(`/api/overview?deviceId=${deviceId}`);
    if (!res.ok) return;
    const d = await res.json();

    const temp = toNum(d.temperature);
    const soil = toNum(d.soilMoisture);
    const lux  = toNum(d.lightIntensity);
    const pumpOn  = Boolean(d.pump);
    const lightOn = Boolean(d.light);

    /* Device */
    const dl = document.getElementById("deviceLabel");
    const did = document.getElementById("deviceIdDisplay");
    if (dl)  dl.textContent  = d.deviceId || deviceId;
    if (did) did.textContent = d.deviceId || deviceId;

    /* Sensor values */
    const tv = document.getElementById("tempVal");
    const sv = document.getElementById("soilVal");
    const lv = document.getElementById("lightIntVal");
    const pv = document.getElementById("pumpVal");
    if (tv) tv.textContent = temp != null ? `${temp.toFixed(1)}°C` : "--";
    if (sv) sv.textContent = soil != null ? `${Math.round(soil)}%` : "--";
    if (lv) lv.textContent = lux  != null ? `${Math.round(lux)} lux` : "-- lux";
    if (pv) { pv.textContent = pumpOn ? "ACTIVE" : "OFF"; pv.style.color = pumpOn ? "var(--green)" : ""; }

    /* Light status card */
    const lav = document.getElementById("lightActVal");
    const las = document.getElementById("lightActStatus");
    const lab = document.getElementById("lightActBar");
    if (lav) { lav.textContent = lightOn ? "ON" : "OFF"; lav.style.color = lightOn ? "#FDD835" : ""; }
    if (las) { las.textContent = lightOn ? "Active" : "OFF"; las.className = "status-tag " + (lightOn ? "warning" : "optimal"); }
    if (lab) lab.style.width = lightOn ? "100%" : "0%";

    /* Status tags */
    setTag("tempStatus",  statusOf(temp, "temp"));
    setTag("moistStatus", statusOf(soil, "moisture"));
    setTag("lightStatus", statusOf(lux, "light"));

    const ps = document.getElementById("pumpStatus");
    if (ps) { ps.textContent = pumpOn ? "Active" : "Idle"; ps.className = "status-tag " + (pumpOn ? "warning" : "optimal"); }

    /* Bars */
    const tb = document.getElementById("tempBar");
    const mb = document.getElementById("moistBar");
    const lb = document.getElementById("lightBar");
    const pb = document.getElementById("pumpBar");
    if (tb) tb.style.width = temp != null ? `${Math.min(100, (temp / 45) * 100)}%` : "0%";
    if (mb) mb.style.width = soil != null ? `${Math.min(100, soil)}%` : "0%";
    if (lb) lb.style.width = lux  != null ? `${Math.min(100, (lux / 2000) * 100)}%` : "0%";
    if (pb) pb.style.width = pumpOn ? "100%" : "0%";

    updateHeroBadge(temp, soil, lux);
    updateFreshness(d.timestamp);

    /* AI Feed */
    renderFeed(buildFeed(temp, soil, lux, lightOn, pumpOn));

  } catch (e) { console.warn("Overview:", e); }
}

/* ─── API: History (3 charts) ─── */
async function refreshHistory() {
  try {
    const res = await fetch(`/api/history?deviceId=${deviceId}&period=${currentPeriod}`);
    if (!res.ok) return;
    const d = await res.json();
    const labels = d.items.map(x => new Date(x.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

    tempChart.data.labels = labels;
    tempChart.data.datasets[0].data = d.items.map(x => x.temperature);
    tempChart.update();

    soilChart.data.labels = labels;
    soilChart.data.datasets[0].data = d.items.map(x => x.soilMoisture);
    soilChart.update();

    luxChart.data.labels = labels;
    luxChart.data.datasets[0].data = d.items.map(x => x.lightIntensity);
    luxChart.update();
  } catch (e) { console.warn("History:", e); }
}

/* ─── API: Events ─── */
async function refreshEvents() {
  try {
    const res = await fetch(`/api/events?deviceId=${deviceId}`);
    if (!res.ok) return;
    const d = await res.json();
    const ul = document.getElementById("timeline");
    if (!ul) return;
    ul.innerHTML = "";

    if (!d.items || d.items.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "No activity yet";
      ul.appendChild(li);
      return;
    }

    d.items.forEach(it => {
      const li = document.createElement("li");
      const s = document.createElement("strong");
      s.textContent = `Pump ${it.pump ? "ON" : "OFF"} · Light ${it.light ? "ON" : "OFF"}`;
      const sm = document.createElement("small");
      sm.textContent = `${new Date(it.timestamp).toLocaleString()} — ${it.source}`;
      li.appendChild(s);
      li.appendChild(sm);
      ul.appendChild(li);
    });
  } catch (e) { console.warn("Events:", e); }
}

/* ─── Send Actuator Command (fire-and-forget) ─── */
async function sendActuatorCommand(field, value, btnEl) {
  if (btnEl) btnEl.classList.add("sending");

  try {
    const payload = { deviceId };
    payload[field] = value;

    const res = await fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) console.error("Command returned", res.status);

    await Promise.all([refreshEvents(), refreshOverview()]);
  } catch (e) {
    console.error("Command failed:", e);
  } finally {
    if (btnEl) btnEl.classList.remove("sending");
  }
}

/* ─── Config: Save Thresholds (client-side only for now) ─── */
document.getElementById("btn-save-config").addEventListener("click", () => {
  const cfg = {
    tempMin:  parseFloat(document.getElementById("cfg-temp-min").value),
    tempMax:  parseFloat(document.getElementById("cfg-temp-max").value),
    moistMin: parseInt(document.getElementById("cfg-moist-min").value, 10),
    moistMax: parseInt(document.getElementById("cfg-moist-max").value, 10),
    luxMin:   parseInt(document.getElementById("cfg-lux-min").value, 10),
    luxMax:   parseInt(document.getElementById("cfg-lux-max").value, 10),
  };
  localStorage.setItem("plantConfig", JSON.stringify(cfg));
  console.log("Config saved:", cfg);

  const btn = document.getElementById("btn-save-config");
  const orig = btn.textContent;
  btn.textContent = "✔ Saved!";
  setTimeout(() => { btn.textContent = orig; }, 1500);
});

/* ─── Init ─── */
document.querySelectorAll(".period-btns button").forEach(btn => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".period-btns button").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    currentPeriod = btn.dataset.period;
    await refreshHistory();
  });
});

/* Actuator buttons */
document.getElementById("btn-pump-on").addEventListener("click",  (e) => sendActuatorCommand("pump",  true,  e.currentTarget));
document.getElementById("btn-pump-off").addEventListener("click", (e) => sendActuatorCommand("pump",  false, e.currentTarget));
document.getElementById("btn-light-on").addEventListener("click",  (e) => sendActuatorCommand("light", true,  e.currentTarget));
document.getElementById("btn-light-off").addEventListener("click", (e) => sendActuatorCommand("light", false, e.currentTarget));

/* Load saved config */
try {
  const saved = JSON.parse(localStorage.getItem("plantConfig") || "{}");
  if (saved.tempMin  != null) document.getElementById("cfg-temp-min").value  = saved.tempMin;
  if (saved.tempMax  != null) document.getElementById("cfg-temp-max").value  = saved.tempMax;
  if (saved.moistMin != null) document.getElementById("cfg-moist-min").value = saved.moistMin;
  if (saved.moistMax != null) document.getElementById("cfg-moist-max").value = saved.moistMax;
  if (saved.luxMin   != null) document.getElementById("cfg-lux-min").value   = saved.luxMin;
  if (saved.luxMax   != null) document.getElementById("cfg-lux-max").value   = saved.luxMax;
} catch (_) {}

async function tick() { await Promise.all([refreshOverview(), refreshEvents()]); }
Promise.all([tick(), refreshHistory()]);
setInterval(tick, 5000);
