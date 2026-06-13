import type { Device, Room, RoomMember } from "@openmesh/shared";
import { generateId } from "@openmesh/shared";
import { isConnected } from "./db.js";
import { DeviceModel, RoomModel } from "./schemas.js";

interface ConnectedDevice extends Device {
  socketId: string;
}

function saveDeviceToDB(device: Device) {
  if (!isConnected()) return;
  DeviceModel.updateOne(
    { id: device.id },
    { $set: device },
    { upsert: true }
  ).catch((err) => {
    console.error("[db] Error saving device to DB:", err);
  });
}

function saveRoomToDB(room: Room) {
  if (!isConnected()) return;
  RoomModel.updateOne(
    { id: room.id },
    { $set: room },
    { upsert: true }
  ).catch((err) => {
    console.error("[db] Error saving room to DB:", err);
  });
}

export class DeviceRegistry {
  private devices = new Map<string, ConnectedDevice>();

  async loadFromDB(): Promise<void> {
    if (!isConnected()) return;
    try {
      const devices = await DeviceModel.find();
      for (const d of devices) {
        this.devices.set(d.id, {
          id: d.id,
          name: d.name,
          status: "offline", // Mark offline initially on server startup
          connectionType: d.connectionType,
          ipAddress: d.ipAddress,
          lastSeen: d.lastSeen,
          platform: d.platform,
          socketId: "",
        });
      }
      console.log(`[db] Loaded ${devices.length} devices from database.`);
    } catch (err) {
      console.error("[db] Error loading devices from database:", err);
    }
  }

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
    
    // Asynchronously save to DB
    const publicDevice = this.toPublicDevice(device);
    saveDeviceToDB(publicDevice);

    return publicDevice;
  }

  unregister(deviceId: string): Device | undefined {
    const device = this.devices.get(deviceId);
    if (!device) return undefined;

    this.devices.delete(deviceId);
    
    const offlineDevice = { ...device, status: "offline" as const };
    const publicDevice = this.toPublicDevice(offlineDevice);
    
    // Update status in DB
    saveDeviceToDB(publicDevice);

    return publicDevice;
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
    
    const publicDevice = this.toPublicDevice(device);
    saveDeviceToDB(publicDevice);

    return publicDevice;
  }

  count(): number {
    return this.devices.size;
  }

  registerDiscoveryDevice(device: Device): Device {
    const connectedDevice: ConnectedDevice = {
      ...device,
      socketId: "",
    };
    this.devices.set(device.id, connectedDevice);
    return device;
  }

  private toPublicDevice(device: ConnectedDevice): Device {
    const { socketId: _, ...publicDevice } = device;
    return publicDevice;
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  async loadFromDB(): Promise<void> {
    if (!isConnected()) return;
    try {
      const rooms = await RoomModel.find({ isActive: true });
      for (const r of rooms) {
        this.rooms.set(r.id, {
          id: r.id,
          name: r.name,
          members: r.members.map((m) => ({
            deviceId: m.deviceId,
            deviceName: m.deviceName,
            role: m.role,
            joinedAt: m.joinedAt,
          })),
          createdAt: r.createdAt,
          createdBy: r.createdBy,
          isActive: r.isActive,
        });
      }
      console.log(`[db] Loaded ${rooms.length} active rooms from database.`);
    } catch (err) {
      console.error("[db] Error loading rooms from database:", err);
    }
  }

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
    saveRoomToDB(room);

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
      saveRoomToDB(room);
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

    saveRoomToDB(room);
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
