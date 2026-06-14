"use client";

import { useEffect, useRef, type RefObject } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type Device, type Room } from "@openmesh/shared";
import { useAppStore } from "@/stores/app-store";

let activeSocket: Socket | null = null;

export function useSocketConnection(): RefObject<Socket | null> {
  const socketRef = useRef<Socket | null>(null);
  const {
    deviceId,
    settings,
    setDevices,
    updateDevice,
    setRooms,
    updateRoom,
    setConnected,
    setServerStatus,
    setSocket,
    addMessage,
  } = useAppStore();

  useEffect(() => {
    setServerStatus("connecting");

    let socket: Socket;
    try {
      socket = io(settings.serverUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });
    } catch (err) {
      setServerStatus("disconnected");
      console.error("Failed to create socket:", err);
      return () => {};
    }

    socketRef.current = socket;
    activeSocket = socket;
    setSocket(socket);

    let heartbeatTimer: NodeJS.Timeout;

    socket.on("connect", () => {
      setServerStatus("connected");
      setConnected(true);

      socket.emit(
        SOCKET_EVENTS.DEVICE_REGISTER,
        {
          deviceId,
          deviceName: settings.deviceName,
          platform: typeof navigator !== "undefined" ? navigator.platform : undefined,
        },
        (response: { success: boolean; device?: Device }) => {
          if (response.success) {
            socket.emit(
              SOCKET_EVENTS.DEVICE_LIST,
              (listResponse: { success: boolean; devices?: Device[] }) => {
                if (listResponse.success && listResponse.devices) {
                  setDevices(listResponse.devices);
                }
              },
            );

            socket.emit(
              SOCKET_EVENTS.ROOM_LIST,
              (roomResponse: { success: boolean; rooms?: Room[] }) => {
                if (roomResponse.success && roomResponse.rooms) {
                  setRooms(roomResponse.rooms);
                }
              },
            );
          }
        },
      );

      // Start heartbeat
      heartbeatTimer = setInterval(() => {
        socket.emit("device:heartbeat", { deviceId });
      }, 15000);
    });

    socket.on("disconnect", () => {
      setServerStatus("disconnected");
      setConnected(false);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    });

    socket.on(SOCKET_EVENTS.DEVICE_UPDATE, (device: Device) => {
      updateDevice(device);
    });

    socket.on(SOCKET_EVENTS.ROOM_UPDATE, (room: Room) => {
      updateRoom(room);
    });

    socket.on(SOCKET_EVENTS.TEXT_MESSAGE, (payload: any) => {
      addMessage(payload.roomId, payload);
    });

    return () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      socket.disconnect();
      socketRef.current = null;
      activeSocket = null;
      setSocket(null);
    };
  }, [
    deviceId,
    settings.deviceName,
    settings.serverUrl,
    setConnected,
    setDevices,
    setRooms,
    setServerStatus,
    updateDevice,
    updateRoom,
    setSocket,
    addMessage,
  ]);

  return socketRef;
}

export function getSocket(): Socket | null {
  return activeSocket;
}
