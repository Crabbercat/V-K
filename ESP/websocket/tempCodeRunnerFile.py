import asyncio
import json
from datetime import datetime

import websockets

HOST = "0.0.0.0"
PORT = 8765
clients = set()
client_roles = {}


def infer_role(message, client_host):
    # Local browser client often connects from localhost.
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


async def broadcast(message, sender=None):
    targets = [ws for ws in clients if ws != sender]
    if not targets:
        return

    results = await asyncio.gather(*(ws.send(message) for ws in targets), return_exceptions=True)
    for ws, result in zip(targets, results):
        if isinstance(result, Exception):
            clients.discard(ws)


async def handler(websocket):
    client = websocket.remote_address
    client_host = client[0] if isinstance(client, tuple) and client else str(client)
    clients.add(websocket)
    client_roles[websocket] = "UNKNOWN"
    print(f"[+] Client connected: {client} | ONLINE={len(clients)}")
    try:
        async for message in websocket:
            if client_roles.get(websocket) == "UNKNOWN":
                client_roles[websocket] = infer_role(message, client_host)

            role = client_roles.get(websocket, "UNKNOWN")
            now = datetime.now().strftime("%H:%M:%S")
            print(f"[{now}] [{role}] RX from {client}: {message}")
            # Keep sender visibility while forwarding to all other clients.
            await websocket.send(f"Echo: {message}")
            await broadcast(f"{message}", sender=websocket)
    except websockets.ConnectionClosed:
        pass
    finally:
        clients.discard(websocket)
        role = client_roles.pop(websocket, "UNKNOWN")
        print(f"[-] [{role}] Client disconnected: {client} | ONLINE={len(clients)}")


async def main():
    print(f"Starting WebSocket server at ws://{HOST}:{PORT}")
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
