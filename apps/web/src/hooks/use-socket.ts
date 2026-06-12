"use client";

import { useEffect, useRef, type RefObject } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS, type Device, type Room } from "@openmesh/shared";
import { useAppStore } from "@/stores/app-store";

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
  } = useAppStore();

  useEffect(() => {
    setServerStatus("connecting");

    const socket = io(settings.serverUrl, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

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
    });

    socket.on("disconnect", () => {
      setServerStatus("disconnected");
      setConnected(false);
    });

    socket.on(SOCKET_EVENTS.DEVICE_UPDATE, (device: Device) => {
      updateDevice(device);
    });

    socket.on(SOCKET_EVENTS.ROOM_UPDATE, (room: Room) => {
      updateRoom(room);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
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
  ]);

  return socketRef;
}

export function getSocket(): Socket | null {
  return null;
}
