# SDK Guide

## Installation

```bash
pnpm add @openmesh/sdk
```

## Quick Start

```typescript
import { OpenMesh } from "@openmesh/sdk";

const client = new OpenMesh({
  serverUrl: "http://localhost:4000",
  deviceName: "My Device",
});

await client.connect();
```

## API Reference

### Constructor

```typescript
new OpenMesh(options?: OpenMeshOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serverUrl` | `string` | `http://localhost:4000` | Signaling server URL |
| `deviceName` | `string` | `"OpenMesh Device"` | Display name on network |
| `deviceId` | `string` | auto-generated | Unique device identifier |

### Methods

#### `connect(): Promise<void>`

Connect to the signaling server and register this device.

#### `disconnect(): void`

Disconnect from the server.

#### `sendFile(file: File): Promise<string>`

Send a file to connected peers. Returns transfer ID.

#### `sendText(content: string, roomId?: string): void`

Send a text message to a room.

#### `sendFolder(files: File[]): Promise<string>`

Send multiple files as a folder transfer.

#### `onDeviceUpdate(callback: (device: Device) => void): void`

Listen for device status changes.

#### `onRoomUpdate(callback: (room: Room) => void): void`

Listen for room membership changes.

## Events

Access socket event constants via `client.events`:

```typescript
import { SOCKET_EVENTS } from "@openmesh/shared";

console.log(SOCKET_EVENTS.DEVICE_REGISTER); // "device:register"
```

## Full Example

```typescript
import { OpenMesh } from "@openmesh/sdk";

async function main() {
  const client = new OpenMesh({ deviceName: "Dev Machine" });

  client.onDeviceUpdate((device) => {
    console.log(`Device ${device.name} is ${device.status}`);
  });

  await client.connect();

  const input = document.querySelector("input[type=file]");
  input?.addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const transferId = await client.sendFile(file);
      console.log(`Transfer started: ${transferId}`);
    }
  });
}

main();
```
