const API = '/api';
const POLL_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 7000;
const REQUEST_POLL_MS = 500;

function setCommandStatus(message, kind = 'idle') {
  const el = document.getElementById('command_status');
  el.textContent = message;
  el.dataset.kind = kind;
}

function toBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function formatServoState(angle) {
  if (angle === undefined || angle === null || angle === '') return '--';
  const numeric = Number(angle);
  return `${numeric}° ${numeric >= 90 ? '(OPEN)' : '(CLOSED)'}`;
}

async function fetchLatest() {
  try {
    const res = await fetch(`${API}/latest`, { cache: 'no-store' });
    if (!res.ok) throw new Error('api unavailable');
    const payload = await res.json();
    renderStatus(payload.current || payload.latest || {});
    syncControls(payload);
    await loadCSV();
  } catch (error) {
    await loadCSV();
  }
}

function renderStatus(data) {
  document.getElementById('temp').textContent = data.temperature ?? '--';
  document.getElementById('soil').textContent = data.soilMoisture ?? '--';
  document.getElementById('heater').textContent = toBool(data.heaterStatus) ? 'ON' : 'OFF';
  document.getElementById('water').textContent = toBool(data.waterValve) ? 'OPEN' : 'CLOSED';
  document.getElementById('servo').textContent = formatServoState(data.servoAngle);
  document.getElementById('last_update').textContent = data.timestamp ?? '--';
}

function syncControls(payload) {
  const commands = payload.commands || {};
  const current = payload.current || {};
  const requested = commands.requested || null;
  if (requested) {
    setCommandStatus(`Pending request #${commands.requestVersion}`, 'pending');
    return;
  }
  setCommandStatus(`Applied #${commands.appliedVersion || 0}`, 'ready');
  if (current) {
    document.querySelectorAll('[data-command="heater"]').forEach((button) => {
      button.classList.toggle('active', button.dataset.value === String(toBool(current.heaterStatus)));
    });
    document.querySelectorAll('[data-command="servo"]').forEach((button) => {
      const isOpen = toBool(current.waterValve);
      button.classList.toggle('active', button.dataset.value === (isOpen ? 'open' : 'close'));
    });
  }
}

async function sendCommand(payload, label) {
  setCommandStatus(`Sending ${label}...`, 'pending');
  const response = await fetch(`${API}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to queue request');
  }

  const queued = await response.json();
  const requestVersion = queued.requestVersion;

  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const latestResponse = await fetch(`${API}/latest`, { cache: 'no-store' });
    if (latestResponse.ok) {
      const snapshot = await latestResponse.json();
      const appliedVersion = snapshot.commands?.appliedVersion || 0;
      const pendingVersion = snapshot.commands?.requestVersion || 0;
      if (appliedVersion >= requestVersion && (!snapshot.commands.requested || pendingVersion === appliedVersion)) {
        setCommandStatus(`${label} applied`, 'ready');
        await fetchLatest();
        return;
      }
    }
    await sleep(REQUEST_POLL_MS);
  }

  setCommandStatus(`${label} timeout`, 'error');
  throw new Error('ESP did not confirm the request in time');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCSV() {
  const response = await fetch('storage/temperature.csv', { cache: 'no-store' });
  if (!response.ok) throw new Error('CSV not accessible');
  const text = await response.text();
  const rows = parseCSV(text);
  populateTable(rows);
  if (rows.length) {
    const last = rows[rows.length - 1];
    renderStatus({
      timestamp: last.timestamp,
      temperature: last.temperature,
      soilMoisture: last.soilMoisture,
      heaterStatus: last.heaterStatus,
      servoAngle: last.servoAngle,
      waterValve: last.waterValve,
    });
  }
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return headers.reduce((row, header, index) => {
      row[header] = cells[index] ?? '';
      return row;
    }, {});
  });
}

function populateTable(rows) {
  const tbody = document.querySelector('#csv_table tbody');
  tbody.innerHTML = '';
  const start = Math.max(0, rows.length - 50);
  rows.slice(start).forEach((row) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.timestamp || ''}</td>
      <td>${row.temperature || ''}</td>
      <td>${row.soilMoisture || ''}</td>
      <td>${row.heaterStatus || ''}</td>
      <td>${row.servoAngle || ''}</td>
      <td>${row.waterValve || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('btn_refresh').addEventListener('click', async () => {
  try {
    await fetchLatest();
    setCommandStatus('Refreshed', 'ready');
  } catch (error) {
    setCommandStatus('Refresh failed', 'error');
  }
});

document.querySelectorAll('[data-command]').forEach((button) => {
  button.addEventListener('click', async () => {
    const commandType = button.dataset.command;
    const value = button.dataset.value;
    try {
      if (commandType === 'heater') {
        await sendCommand({ heater: value === 'true' }, value === 'true' ? 'Heater ON' : 'Heater OFF');
      } else if (commandType === 'servo') {
        await sendCommand({ servoAngle: value === 'open' ? 90 : 0 }, value === 'open' ? 'Servo OPEN' : 'Servo CLOSE');
      }
    } catch (error) {
      setCommandStatus(error.message || 'Command failed', 'error');
      alert(error.message || 'Command failed');
    }
  });
});

setInterval(fetchLatest, POLL_INTERVAL_MS);
fetchLatest();
