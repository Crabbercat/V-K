from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
import csv
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
STORAGE_DIR = os.path.join(BASE_DIR, 'storage')
CONFIG_PATH = os.path.join(STORAGE_DIR, 'config.json')
DATA_CSV = os.path.join(STORAGE_DIR, 'temperature.csv')
DATA_JSON = os.path.join(STORAGE_DIR, 'data.json')
COMMANDS_PATH = os.path.join(STORAGE_DIR, 'commands.json')

os.makedirs(STORAGE_DIR, exist_ok=True)

# Load or create default config
default_config = {
    "temp_low": 18,
    "soil_dry": 2000,
    "soil_wet": 3000,
    "servo_open_angle": 90,
    "servo_closed_angle": 0,
    "heater_pin": 2
}
if not os.path.exists(CONFIG_PATH):
    with open(CONFIG_PATH, 'w') as f:
        json.dump(default_config, f, indent=2)

with open(CONFIG_PATH, 'r') as f:
    config = json.load(f)

# Backfill new config fields on older installations
config_changed = False
for key, value in {
    "soil_dry": 2000,
    "soil_wet": 3000,
    "heater_pin": 2,
}.items():
    if key not in config:
        config[key] = value
        config_changed = True
if config_changed:
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=2)

# Ensure data files exist
expected_csv_header = ['timestamp', 'temperature', 'soilMoisture', 'heaterStatus', 'servoAngle', 'waterValve']
if not os.path.exists(DATA_CSV):
    with open(DATA_CSV, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(expected_csv_header)
else:
    with open(DATA_CSV, 'r', newline='') as f:
        first_line = f.readline().strip()
    if first_line and first_line.split(',') != expected_csv_header:
        legacy_path = os.path.join(STORAGE_DIR, 'temperature_legacy.csv')
        if not os.path.exists(legacy_path):
            os.replace(DATA_CSV, legacy_path)
        with open(DATA_CSV, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(expected_csv_header)

if not os.path.exists(DATA_JSON):
    with open(DATA_JSON, 'w') as f:
        json.dump([], f)

# Commands state
if os.path.exists(COMMANDS_PATH):
    with open(COMMANDS_PATH, 'r') as f:
        commands = json.load(f)
else:
    commands = {
        "requested": None,
        "current": {
            "heater": False,
            "servoAngle": config.get('servo_closed_angle', 0),
            "waterValve": False,
        },
        "requestVersion": 0,
        "appliedVersion": 0,
    }
    with open(COMMANDS_PATH, 'w') as f:
        json.dump(commands, f)

def normalize_commands_state(raw):
    raw = raw if isinstance(raw, dict) else {}
    current = raw.get('current', {}) if isinstance(raw.get('current', {}), dict) else {}
    requested = raw.get('requested', None)
    if requested is not None and not isinstance(requested, dict):
        requested = None
    normalized = {
        'requested': requested,
        'current': {
            'heater': bool(current.get('heater', raw.get('heater', False))),
            'servoAngle': int(current.get('servoAngle', raw.get('servoAngle', config.get('servo_closed_angle', 0)))),
            'waterValve': bool(current.get('waterValve', raw.get('waterValve', False))),
        },
        'requestVersion': int(raw.get('requestVersion', 0)),
        'appliedVersion': int(raw.get('appliedVersion', 0)),
    }
    return normalized

commands = normalize_commands_state(commands)

app = Flask(__name__, static_folder='.')
CORS(app)

def save_command_state():
    with open(COMMANDS_PATH, 'w') as f:
        json.dump(commands, f)

save_command_state()

def current_state_from(latest):
    current = dict(latest or {})
    current_cmd = commands.get('current', {})
    current['heaterStatus'] = bool(current_cmd.get('heater', current.get('heaterStatus', False)))
    current['servoAngle'] = int(current_cmd.get('servoAngle', current.get('servoAngle', config.get('servo_closed_angle', 0))))
    current['waterValve'] = bool(current_cmd.get('waterValve', current['servoAngle'] == config.get('servo_open_angle', 90)))
    return current

def requested_state_from_payload(data):
    requested = {}
    if 'heater' in data:
        requested['heater'] = bool(data['heater'])
    if 'servoAngle' in data:
        requested['servoAngle'] = int(data['servoAngle'])
        requested['waterValve'] = requested['servoAngle'] == config.get('servo_open_angle', 90)
    elif 'waterValve' in data:
        requested['waterValve'] = bool(data['waterValve'])
        requested['servoAngle'] = config.get('servo_open_angle', 90) if requested['waterValve'] else config.get('servo_closed_angle', 0)
    return requested

def append_data(record):
    # append to csv and json
    with open(DATA_CSV, 'a', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            record.get('timestamp'),
            record.get('temperature'),
            record.get('soilMoisture'),
            record.get('heaterStatus'),
            record.get('servoAngle'),
            record.get('waterValve'),
        ])
    with open(DATA_JSON, 'r+') as f:
        arr = json.load(f)
        arr.append(record)
        f.seek(0)
        json.dump(arr, f, indent=2)
        f.truncate()

@app.route('/')
def index():
    return send_from_directory('.', 'web_client.html')

@app.route('/api/sensor', methods=['POST'])
def receive_sensor():
    data = request.get_json() or {}
    # expected fields: temperature, soilMoisture, heaterStatus, servoAngle, waterValve
    record = {
        'timestamp': datetime.now().isoformat(),
        'temperature': data.get('temperature'),
        'soilMoisture': data.get('soilMoisture'),
        'heaterStatus': data.get('heaterStatus'),
        'servoAngle': data.get('servoAngle'),
        'waterValve': data.get('waterValve')
    }
    append_data(record)

    # Update actual current state from what the ESP reports back
    commands['current']['heater'] = bool(record.get('heaterStatus', False))
    commands['current']['servoAngle'] = int(data.get('servoAngle', commands['current']['servoAngle']))
    commands['current']['waterValve'] = bool(record.get('waterValve', False))

    # If ESP confirms it applied the current request, clear the pending request
    applied_version = data.get('appliedCommandVersion')
    if applied_version is not None and int(applied_version) == int(commands.get('requestVersion', 0)):
        commands['appliedVersion'] = int(applied_version)
        commands['requested'] = None
    save_command_state()

    return jsonify({'status': 'ok'})

@app.route('/api/commands', methods=['GET', 'POST'])
def api_commands():
    global commands
    if request.method == 'GET':
        return jsonify({
            'requested': commands.get('requested'),
            'requestVersion': commands.get('requestVersion', 0),
            'appliedVersion': commands.get('appliedVersion', 0),
            'current': commands.get('current', {}),
        })
    else:
        data = request.get_json() or {}
        requested = requested_state_from_payload(data)
        if requested:
            commands['requested'] = requested
            commands['requestVersion'] = int(commands.get('requestVersion', 0)) + 1
        else:
            return jsonify({'status': 'error', 'message': 'missing heater or servoAngle'}), 400
        save_command_state()
        return jsonify({'status': 'queued', 'requestVersion': commands['requestVersion'], 'requested': commands['requested']})

@app.route('/api/latest', methods=['GET'])
def api_latest():
    # return last record
    with open(DATA_JSON, 'r') as f:
        arr = json.load(f)
    last = arr[-1] if arr else None
    return jsonify({'latest': last, 'current': current_state_from(last), 'commands': commands, 'config': config})

# serve web client assets
@app.route('/<path:filename>')
def serve_file(filename):
    if os.path.exists(filename):
        return send_from_directory('.', filename)
    return ('', 404)

if __name__ == '__main__':
    print('Starting HTTP server on http://0.0.0.0:5000')
    app.run(host='0.0.0.0', port=5000)
