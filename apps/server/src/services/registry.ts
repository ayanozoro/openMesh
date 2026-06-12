import type { Device, Room, RoomMember } from "@openmesh/shared";
import { generateId } from "@openmesh/shared";

interface ConnectedDevice extends Device {
  socketId: string;
}

export class DeviceRegistry {
  private devices = new Map<string, ConnectedDevice>();

  register(socketId: string, deviceId: string, deviceName: string, platform?: string): Device {
    const device: ConnectedDevice = {
      id: deviceId,
      name: deviceName,
      status: "online",
      connectionType: "websocket",
      lastSeen: new Date().toISOString(),
      platform,
      socketId,
    };

    this.devices.set(deviceId, device);
    return this.toPublicDevice(device);
  }

  unregister(deviceId: string): Device | undefined {
    const device = this.devices.get(deviceId);
    if (!device) return undefined;

    this.devices.delete(deviceId);
    return this.toPublicDevice({ ...device, status: "offline" });
  }

  unregisterBySocket(socketId: string): Device | undefined {
    for (const [id, device] of this.devices) {
      if (device.socketId === socketId) {
        return this.unregister(id);
      }
    }
    return undefined;
  }

  get(deviceId: string): Device | undefined {
    const device = this.devices.get(deviceId);
    return device ? this.toPublicDevice(device) : undefined;
  }

  getSocketId(deviceId: string): string | undefined {
    return this.devices.get(deviceId)?.socketId;
  }

  getAll(): Device[] {
    return Array.from(this.devices.values()).map((d) => this.toPublicDevice(d));
  }

  updateStatus(deviceId: string, status: Device["status"]): Device | undefined {
    const device = this.devices.get(deviceId);
    if (!device) return undefined;

    device.status = status;
    device.lastSeen = new Date().toISOString();
    return this.toPublicDevice(device);
  }

  count(): number {
    return this.devices.size;
  }

  private toPublicDevice(device: ConnectedDevice): Device {
    const { socketId: _, ...publicDevice } = device;
    return publicDevice;
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  create(name: string, ownerId: string, ownerName: string): Room {
    const room: Room = {
      id: generateId("room"),
      name,
      members: [
        {
          deviceId: ownerId,
          deviceName: ownerName,
          role: "owner",
          joinedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      createdBy: ownerId,
      isActive: true,
    };

    this.rooms.set(room.id, room);
    return room;
  }

  join(roomId: string, deviceId: string, deviceName: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.isActive) return null;

    const existing = room.members.find((m) => m.deviceId === deviceId);
    if (!existing) {
      const member: RoomMember = {
        deviceId,
        deviceName,
        role: "member",
        joinedAt: new Date().toISOString(),
      };
      room.members.push(member);
    }

    return room;
  }

  leave(roomId: string, deviceId: string): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    room.members = room.members.filter((m) => m.deviceId !== deviceId);

    if (room.members.length === 0) {
      room.isActive = false;
    }

    return room;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getAll(): Room[] {
    return Array.from(this.rooms.values()).filter((r) => r.isActive);
  }

  getActiveCount(): number {
    return this.getAll().length;
  }

  getRoomsForDevice(deviceId: string): Room[] {
    return this.getAll().filter((r) => r.members.some((m) => m.deviceId === deviceId));
  }
}
