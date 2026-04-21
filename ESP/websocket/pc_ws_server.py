import asyncio
import csv
import json
import os
import threading
from dataclasses import dataclass, field
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import websockets

HOST = "0.0.0.0"
HTTP_PORT = int(os.getenv("HTTP_PORT", "8000"))
DEVICE_PORT = 8765
WEB_PORT = 8766
BASE_DIR = Path(__file__).resolve().parent
UI_DIR = str(BASE_DIR)
STORAGE_DIR = BASE_DIR / "storage"
TEMPERATURE_CSV = STORAGE_DIR / "temperature.csv"
ALERTS_JSON = STORAGE_DIR / "alerts.json"
CONFIG_JSON = STORAGE_DIR / "config.json"
FILE_LOCK = threading.Lock()

DEFAULT_CONFIG = {
    "temperatureMin": 24.0,
    "temperatureMax": 30.0,
    "motionDelta": 4.0,
    "decisionTimeoutSec": 10,
}


@dataclass
class HubState:
    device_clients: set = field(default_factory=set)
    web_clients: set = field(default_factory=set)
    client_roles: dict = field(default_factory=dict)


state = HubState()


def ensure_storage_files():
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    if not TEMPERATURE_CSV.exists():
        with TEMPERATURE_CSV.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow(["timestamp", "temperature_c", "distance_cm", "source"])
    if not ALERTS_JSON.exists():
        with ALERTS_JSON.open("w", encoding="utf-8") as handle:
            json.dump({"alerts": []}, handle, ensure_ascii=False, indent=2)
    if not CONFIG_JSON.exists():
        with CONFIG_JSON.open("w", encoding="utf-8") as handle:
            json.dump(DEFAULT_CONFIG, handle, ensure_ascii=False, indent=2)


def read_config():
    with FILE_LOCK:
        ensure_storage_files()
        try:
            with CONFIG_JSON.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (json.JSONDecodeError, FileNotFoundError):
            payload = dict(DEFAULT_CONFIG)

        merged = dict(DEFAULT_CONFIG)
        if isinstance(payload, dict):
            if "temperatureMin" in payload:
                merged["temperatureMin"] = float(payload["temperatureMin"])
            if "temperatureMax" in payload:
                merged["temperatureMax"] = float(payload["temperatureMax"])
            if "motionDelta" in payload:
                merged["motionDelta"] = max(0.0, float(payload["motionDelta"]))
            if "decisionTimeoutSec" in payload:
                merged["decisionTimeoutSec"] = max(1, int(payload["decisionTimeoutSec"]))

        if merged["temperatureMin"] > merged["temperatureMax"]:
            merged["temperatureMin"], merged["temperatureMax"] = merged["temperatureMax"], merged["temperatureMin"]

        return merged


def write_config(new_values):
    merged = dict(read_config())

    if "temperatureMin" in new_values:
        merged["temperatureMin"] = float(new_values["temperatureMin"])
    if "temperatureMax" in new_values:
        merged["temperatureMax"] = float(new_values["temperatureMax"])
    if "motionDelta" in new_values:
        merged["motionDelta"] = max(0.0, float(new_values["motionDelta"]))
    if "decisionTimeoutSec" in new_values:
        merged["decisionTimeoutSec"] = max(1, int(new_values["decisionTimeoutSec"]))

    if merged["temperatureMin"] > merged["temperatureMax"]:
        merged["temperatureMin"], merged["temperatureMax"] = merged["temperatureMax"], merged["temperatureMin"]

    with FILE_LOCK:
        ensure_storage_files()
        with CONFIG_JSON.open("w", encoding="utf-8") as handle:
            json.dump(merged, handle, ensure_ascii=False, indent=2)

    return merged


def append_temperature_sample(timestamp, temperature_c, distance_cm, source):
    with FILE_LOCK:
        ensure_storage_files()
        with TEMPERATURE_CSV.open("a", newline="", encoding="utf-8") as handle:
            writer = csv.writer(handle)
            writer.writerow([timestamp, f"{temperature_c:.2f}", f"{distance_cm:.2f}" if distance_cm is not None else "", source])


def append_alert_record(record):
    with FILE_LOCK:
        ensure_storage_files()
        try:
            with ALERTS_JSON.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except (json.JSONDecodeError, FileNotFoundError):
            payload = {"alerts": []}

        alerts = payload.get("alerts", [])
        alerts.append(record)
        payload["alerts"] = alerts[-200:]

        with ALERTS_JSON.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)


def infer_role(message, client_host):
    if client_host in {"127.0.0.1", "::1", "localhost"}:
        return "WEB"

    try:
        payload = json.loads(message)
    except (json.JSONDecodeError, TypeError):
        payload = None

    if isinstance(payload, dict):
        device = str(payload.get("device", "")).lower()
        sensor = str(payload.get("sensor", "")).lower()
        if "esp" in device or "temp" in sensor:
            return "ESP"

    text = str(message).lower()
    if "hello from esp" in text:
        return "ESP"

    return "WEB"


def get_local_port(websocket):
    local = getattr(websocket, "local_address", None)
    if isinstance(local, tuple) and len(local) >= 2:
        return local[1]
    return None


async def safe_send(websocket, message):
    try:
        await websocket.send(message)
        return True
    except Exception:
        return False


async def broadcast(targets, message, sender=None):
    recipients = [ws for ws in targets if ws != sender]
    if not recipients:
        return

    results = await asyncio.gather(*(safe_send(ws, message) for ws in recipients), return_exceptions=True)
    for ws, result in zip(recipients, results):
        if result is not True:
            targets.discard(ws)


async def route_message(websocket, message, client_host, port, inferred_role):
    role = inferred_role
    if role == "UNKNOWN":
        role = infer_role(message, client_host)
        state.client_roles[websocket] = role

    now = datetime.now().isoformat(timespec="seconds")
    print(f"[{now}] [{role}] RX on port {port} from {client_host}: {message}")

    payload = None
    if isinstance(message, str):
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            payload = None

    if port == DEVICE_PORT:
        if isinstance(payload, dict):
            temp_value = payload.get("temperature_c")
            distance_value = payload.get("distance_cm")
            if temp_value is not None:
                try:
                    temperature_c = float(temp_value)
                    distance_cm = float(distance_value) if distance_value is not None else None
                    append_temperature_sample(now, temperature_c, distance_cm, "esp")
                except (TypeError, ValueError):
                    pass
        await safe_send(websocket, f"Echo: {message}")
        await broadcast(state.web_clients, message, sender=None)
        return

    if port == WEB_PORT:
        if isinstance(payload, dict) and str(payload.get("type", "")).lower() in {"ui_alert", "alert", "motion_alert", "temperature_alert", "settings_update"}:
            append_alert_record({
                "timestamp": payload.get("timestamp", now),
                "kind": str(payload.get("kind", payload.get("type", "info"))).lower(),
                "title": str(payload.get("title", "Cảnh báo")),
                "detail": str(payload.get("detail", payload.get("message", ""))),
            })
            await safe_send(websocket, f"Echo: {message}")
            return

        await safe_send(websocket, f"Echo: {message}")
        await broadcast(state.device_clients, message, sender=None)
        return

    await safe_send(websocket, f"Echo: {message}")


async def handler(websocket):
    client = websocket.remote_address
    client_host = client[0] if isinstance(client, tuple) and client else str(client)
    port = get_local_port(websocket)
    role = "UNKNOWN"

    if port == DEVICE_PORT:
        state.device_clients.add(websocket)
        role = "ESP"
    elif port == WEB_PORT:
        state.web_clients.add(websocket)
        role = "WEB"
    else:
        state.web_clients.add(websocket)

    state.client_roles[websocket] = role
    print(f"[+] Client connected on port {port}: {client} | role={role}")

    try:
        async for message in websocket:
            await route_message(websocket, message, client_host, port, state.client_roles.get(websocket, role))
    except websockets.ConnectionClosed:
        pass
    finally:
        state.device_clients.discard(websocket)
        state.web_clients.discard(websocket)
        final_role = state.client_roles.pop(websocket, role)
        print(f"[-] [{final_role}] Client disconnected: {client} | DEVICE={len(state.device_clients)} WEB={len(state.web_clients)}")


async def main():
    ensure_storage_files()
    print(f"Starting device WebSocket server at ws://{HOST}:{DEVICE_PORT}")
    print(f"Starting web WebSocket server at ws://{HOST}:{WEB_PORT}")
    print(f"Starting frontend server at http://{HOST}:{HTTP_PORT}/")

    class FrontendHandler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/api/config":
                payload = json.dumps(read_config(), ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return

            if self.path in {"/", "/index.html"}:
                self.path = "/web_client.html"
            return super().do_GET()

        def do_POST(self):
            if self.path == "/api/config":
                try:
                    content_length = int(self.headers.get("Content-Length", "0"))
                    body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
                    payload = json.loads(body)
                    if not isinstance(payload, dict):
                        raise ValueError("Config payload must be a JSON object")

                    updated = write_config(payload)
                    response = json.dumps({"ok": True, "config": updated}, ensure_ascii=False).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(response)))
                    self.end_headers()
                    self.wfile.write(response)
                except Exception as exc:
                    response = json.dumps({"ok": False, "error": str(exc)}).encode("utf-8")
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(response)))
                    self.end_headers()
                    self.wfile.write(response)
                return

            if self.path != "/api/alert":
                self.send_response(404)
                self.end_headers()
                return

            try:
                content_length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
                payload = json.loads(body)
                append_alert_record({
                    "timestamp": payload.get("timestamp", datetime.now().isoformat(timespec="seconds")),
                    "kind": str(payload.get("kind", "info")).lower(),
                    "title": str(payload.get("title", "Cảnh báo")),
                    "detail": str(payload.get("detail", payload.get("message", ""))),
                })
                response = json.dumps({"ok": True}).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(response)))
                self.end_headers()
                self.wfile.write(response)
            except Exception as exc:
                response = json.dumps({"ok": False, "error": str(exc)}).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(response)))
                self.end_headers()
                self.wfile.write(response)

        def log_message(self, format, *args):
            return

    http_server = ThreadingHTTPServer((HOST, HTTP_PORT), partial(FrontendHandler, directory=UI_DIR))
    http_thread = threading.Thread(target=http_server.serve_forever, daemon=True)
    http_thread.start()

    async with websockets.serve(handler, HOST, DEVICE_PORT):
        async with websockets.serve(handler, HOST, WEB_PORT):
            try:
                await asyncio.Future()
            finally:
                http_server.shutdown()
                http_server.server_close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
