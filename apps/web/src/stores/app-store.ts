"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppSettings, Device, Room, TransferItem } from "@openmesh/shared";
import { DEFAULT_SETTINGS, generateId, getDefaultDeviceName } from "@openmesh/shared";

interface AppState {
  deviceId: string;
  settings: AppSettings;
  devices: Device[];
  rooms: Room[];
  activeRoomId: string | null;
  transfers: TransferItem[];
  isConnected: boolean;
  serverStatus: "connected" | "disconnected" | "connecting";

  setSettings: (settings: Partial<AppSettings>) => void;
  setDevices: (devices: Device[]) => void;
  updateDevice: (device: Device) => void;
  setRooms: (rooms: Room[]) => void;
  updateRoom: (room: Room) => void;
  setActiveRoom: (roomId: string | null) => void;
  addTransfer: (transfer: TransferItem) => void;
  updateTransfer: (id: string, updates: Partial<TransferItem>) => void;
  removeTransfer: (id: string) => void;
  setConnected: (connected: boolean) => void;
  setServerStatus: (status: AppState["serverStatus"]) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      deviceId: generateId("dev"),
      settings: {
        ...DEFAULT_SETTINGS,
        deviceName: getDefaultDeviceName(),
      },
      devices: [],
      rooms: [],
      activeRoomId: null,
      transfers: [],
      isConnected: false,
      serverStatus: "disconnected",

      setSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),

      setDevices: (devices) => set({ devices }),

      updateDevice: (device) =>
        set((state) => {
          const index = state.devices.findIndex((d) => d.id === device.id);
          if (index === -1) {
            return { devices: [...state.devices, device] };
          }
          const devices = [...state.devices];
          devices[index] = device;
          return { devices };
        }),

      setRooms: (rooms) => set({ rooms }),

      updateRoom: (room) =>
        set((state) => {
          const index = state.rooms.findIndex((r) => r.id === room.id);
          if (index === -1) {
            return { rooms: [...state.rooms, room] };
          }
          const rooms = [...state.rooms];
          rooms[index] = room;
          return { rooms };
        }),

      setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

      addTransfer: (transfer) =>
        set((state) => ({
          transfers: [transfer, ...state.transfers],
        })),

      updateTransfer: (id, updates) =>
        set((state) => ({
          transfers: state.transfers.map((t) => (t.id === id ? { ...t, ...updates } : t)),
        })),

      removeTransfer: (id) =>
        set((state) => ({
          transfers: state.transfers.filter((t) => t.id !== id),
        })),

      setConnected: (connected) => set({ isConnected: connected }),

      setServerStatus: (status) => set({ serverStatus: status }),
    }),
    {
      name: "openmesh-storage",
      partialize: (state) => ({
        deviceId: state.deviceId,
        settings: state.settings,
        activeRoomId: state.activeRoomId,
      }),
    },
  ),
);
