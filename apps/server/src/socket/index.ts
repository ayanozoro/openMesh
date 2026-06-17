import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import mongoose from "mongoose";
import {
  SOCKET_EVENTS,
  type DeviceRegisterPayload,
  type RoomCreatePayload,
  type RoomJoinPayload,
  type TextMessagePayload,
  type WebRTCSignalPayload,
} from "@openmesh/shared";
import { DeviceRegistry, RoomManager } from "../services/registry.js";
import { LANDiscoveryService } from "../services/discovery.js";

interface SocketData {
  deviceId?: string;
  deviceName?: string;
}

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN ?? "*",
      methods: ["GET", "POST"],
    },
    // Use more lenient ping settings to tolerate intermittent latency
    // Defaults are: pingInterval 25000, pingTimeout 60000
    pingInterval: Number(process.env.SOCKET_PING_INTERVAL ?? 25000),
    pingTimeout: Number(process.env.SOCKET_PING_TIMEOUT ?? 20000),
  });

  // Log HTTP upgrade attempts to diagnose websocket handshake issues
  try {
    httpServer.on("upgrade", (req, _socket, _head) => {
      try {
        console.log(`[upgrade] HTTP upgrade requested: ${req.url} from ${req.socket.remoteAddress}`);
      } catch (err) {
        console.error("[upgrade] Error logging upgrade request", err);
      }
    });
  } catch (err) {
    console.error("[upgrade] Failed to attach upgrade listener", err);
  }

  // Engine-level connection errors (handshake failures)
  try {
    // engine may not be initialized immediately in some environments
    if ((io as any).engine && (io as any).engine.on) {
      (io as any).engine.on("connection_error", (err: unknown) => {
        console.error("[socket][engine] connection_error:", err);
      });
    }
  } catch (err) {
    console.error("[socket] Failed to attach engine connection_error listener", err);
  }

  io.on("error", (err) => {
    console.error("[socket] Server error:", err);
  });

  const deviceRegistry = new DeviceRegistry();
  const roomManager = new RoomManager();

  // Load registered devices and rooms from DB if active
  if (mongoose.connection.readyState === 1) {
    deviceRegistry.loadFromDB();
    roomManager.loadFromDB();
  } else {
    mongoose.connection.once("open", () => {
      deviceRegistry.loadFromDB();
      roomManager.loadFromDB();
    });
  }

  // Initialize LAN Discovery Service
  const port = Number(process.env.PORT ?? 4000);
  const discoveryService = new LANDiscoveryService(deviceRegistry, io, port);
  discoveryService.start();

  // Periodic cleanup of stale WebSocket devices (heartbeat check)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    // increase grace window to tolerate background throttling / transient network
    const maxAge = Number(process.env.DEVICE_MAX_AGE_MS ?? 60000); // 60s

    const devices = deviceRegistry.getAll();
    devices.forEach((device) => {
      if (device.connectionType === "websocket" && device.status === "online") {
        const lastSeenTime = new Date(device.lastSeen).getTime();
        if (now - lastSeenTime > maxAge) {
          console.log(`[heartbeat] Device timed out: ${device.name} (${device.id})`);
          const updated = deviceRegistry.updateStatus(device.id, "offline");
          if (updated) {
            io.emit(SOCKET_EVENTS.DEVICE_UPDATE, updated);
          }
        }
      }
    });
  }, 10000);

  io.on("connection", (socket: Socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

    // Refresh lastSeen on any incoming event to reduce false timeouts
    socket.onAny(() => {
      const data = socket.data as SocketData;
      if (data?.deviceId) {
        deviceRegistry.updateStatus(data.deviceId, "online");
      }
    });

    socket.on(SOCKET_EVENTS.DEVICE_REGISTER, (payload: DeviceRegisterPayload, callback?) => {
      try {
        const device = deviceRegistry.register(
          socket.id,
          payload.deviceId,
          payload.deviceName,
          payload.platform,
        );

        (socket.data as SocketData).deviceId = payload.deviceId;
        (socket.data as SocketData).deviceName = payload.deviceName;

        socket.join(`device:${payload.deviceId}`);

        // Reconnect to active rooms the device is a member of
        const activeRooms = roomManager.getRoomsForDevice(payload.deviceId);
        activeRooms.forEach((room) => {
          socket.join(`room:${room.id}`);
          io.to(`room:${room.id}`).emit(SOCKET_EVENTS.ROOM_UPDATE, room);
        });

        io.emit(SOCKET_EVENTS.DEVICE_UPDATE, device);
        callback?.({ success: true, device });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Registration failed";
        callback?.({ success: false, error: message });
      }
    });

    socket.on(SOCKET_EVENTS.DEVICE_LIST, (callback?) => {
      callback?.({ success: true, devices: deviceRegistry.getAll() });
    });

    socket.on("device:heartbeat", (payload: { deviceId: string }) => {
      deviceRegistry.updateStatus(payload.deviceId, "online");
    });

    socket.on(SOCKET_EVENTS.ROOM_CREATE, (payload: RoomCreatePayload, callback?) => {
      try {
        const room = roomManager.create(payload.name, payload.deviceId, payload.deviceName);
        socket.join(`room:${room.id}`);
        io.emit(SOCKET_EVENTS.ROOM_UPDATE, room);
        callback?.({ success: true, room });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Room creation failed";
        callback?.({ success: false, error: message });
      }
    });

    socket.on(SOCKET_EVENTS.ROOM_JOIN, (payload: RoomJoinPayload, callback?) => {
      const room = roomManager.join(payload.roomId, payload.deviceId, payload.deviceName);
      if (!room) {
        callback?.({ success: false, error: "Room not found or inactive" });
        return;
      }

      socket.join(`room:${payload.roomId}`);
      io.to(`room:${payload.roomId}`).emit(SOCKET_EVENTS.ROOM_UPDATE, room);
      callback?.({ success: true, room });
    });

    socket.on(SOCKET_EVENTS.ROOM_LEAVE, (payload: RoomJoinPayload, callback?) => {
      const room = roomManager.leave(payload.roomId, payload.deviceId);
      socket.leave(`room:${payload.roomId}`);

      if (room) {
        io.to(`room:${payload.roomId}`).emit(SOCKET_EVENTS.ROOM_UPDATE, room);
      }

      callback?.({ success: true, room });
    });

    socket.on(SOCKET_EVENTS.ROOM_LIST, (callback?) => {
      callback?.({ success: true, rooms: roomManager.getAll() });
    });

    socket.on(SOCKET_EVENTS.SIGNAL_OFFER, (payload: WebRTCSignalPayload) => {
      const targetSocketId = deviceRegistry.getSocketId(payload.toDeviceId);
      if (targetSocketId) {
        io.to(targetSocketId).emit(SOCKET_EVENTS.SIGNAL_OFFER, payload);
      }
    });

    socket.on(SOCKET_EVENTS.SIGNAL_ANSWER, (payload: WebRTCSignalPayload) => {
      const targetSocketId = deviceRegistry.getSocketId(payload.toDeviceId);
      if (targetSocketId) {
        io.to(targetSocketId).emit(SOCKET_EVENTS.SIGNAL_ANSWER, payload);
      }
    });

    socket.on(SOCKET_EVENTS.SIGNAL_ICE, (payload: WebRTCSignalPayload) => {
      const targetSocketId = deviceRegistry.getSocketId(payload.toDeviceId);
      if (targetSocketId) {
        io.to(targetSocketId).emit(SOCKET_EVENTS.SIGNAL_ICE, payload);
      }
    });

    socket.on(SOCKET_EVENTS.TEXT_MESSAGE, (payload: TextMessagePayload) => {
      io.to(`room:${payload.roomId}`).emit(SOCKET_EVENTS.TEXT_MESSAGE, payload);
    });

    socket.on("disconnect", () => {
      const device = deviceRegistry.unregisterBySocket(socket.id);
      if (device) {
        io.emit(SOCKET_EVENTS.DEVICE_UPDATE, device);
        console.log(`[socket] Device disconnected: ${device.name} (${device.id})`);
      } else {
        console.log(`[socket] Client disconnected: ${socket.id}`);
      }
    });
  });

  // Cleanup on system close if needed
  process.on("SIGINT", () => {
    clearInterval(cleanupInterval);
    discoveryService.stop();
  });
  process.on("SIGTERM", () => {
    clearInterval(cleanupInterval);
    discoveryService.stop();
  });

  return io;
}

export function getServerStats(
  deviceRegistry: DeviceRegistry,
  roomManager: RoomManager,
): { connectedDevices: number; activeRooms: number } {
  return {
    connectedDevices: deviceRegistry.count(),
    activeRooms: roomManager.getActiveCount(),
  };
}
