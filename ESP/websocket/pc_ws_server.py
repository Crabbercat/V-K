import asyncio
from datetime import datetime

import websockets

HOST = "0.0.0.0"
PORT = 8765


async def handler(websocket):
    client = websocket.remote_address
    print(f"[+] Client connected: {client}")
    try:
        async for message in websocket:
            now = datetime.now().strftime("%H:%M:%S")
            print(f"[{now}] RX from {client}: {message}")
            await websocket.send(f"Echo: {message}")
    except websockets.ConnectionClosed:
        pass
    finally:
        print(f"[-] Client disconnected: {client}")


async def main():
    print(f"Starting WebSocket server at ws://{HOST}:{PORT}")
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
