import asyncio
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


@dataclass
class HubState:
    device_clients: set = field(default_factory=set)
    web_clients: set = field(default_factory=set)
    client_roles: dict = field(default_factory=dict)


state = HubState()


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

    now = datetime.now().strftime("%H:%M:%S")
    print(f"[{now}] [{role}] RX on port {port} from {client_host}: {message}")

    if port == DEVICE_PORT:
        await safe_send(websocket, f"Echo: {message}")
        await broadcast(state.web_clients, message, sender=None)
        return

    if port == WEB_PORT:
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
    print(f"Starting device WebSocket server at ws://{HOST}:{DEVICE_PORT}")
    print(f"Starting web WebSocket server at ws://{HOST}:{WEB_PORT}")
    print(f"Starting frontend server at http://{HOST}:{HTTP_PORT}/")

    class FrontendHandler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.path in {"/", "/index.html"}:
                self.path = "/web_client.html"
            return super().do_GET()

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
