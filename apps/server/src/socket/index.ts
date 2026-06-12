import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  SOCKET_EVENTS,
  type DeviceRegisterPayload,
  type RoomCreatePayload,
  type RoomJoinPayload,
  type TextMessagePayload,
  type WebRTCSignalPayload,
} from "@openmesh/shared";
import { DeviceRegistry, RoomManager } from "../services/registry.js";

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
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  const deviceRegistry = new DeviceRegistry();
  const roomManager = new RoomManager();

  io.on("connection", (socket: Socket) => {
    console.log(`[socket] Client connected: ${socket.id}`);

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
