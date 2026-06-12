export type DeviceStatus = "online" | "offline" | "connecting" | "busy";

export type ConnectionType = "webrtc" | "websocket" | "lan";

export interface Device {
  id: string;
  name: string;
  status: DeviceStatus;
  connectionType: ConnectionType;
  ipAddress?: string;
  lastSeen: string;
  platform?: string;
}

export type RoomMemberRole = "owner" | "member";

export interface RoomMember {
  deviceId: string;
  deviceName: string;
  role: RoomMemberRole;
  joinedAt: string;
}

export interface Room {
  id: string;
  name: string;
  members: RoomMember[];
  createdAt: string;
  createdBy: string;
  isActive: boolean;
}

export type TransferStatus =
  | "pending"
  | "queued"
  | "transferring"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type TransferDirection = "send" | "receive";

export interface TransferItem {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: TransferStatus;
  direction: TransferDirection;
  progress: number;
  bytesTransferred: number;
  speed: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  checksum?: string;
  roomId?: string;
  peerId?: string;
}

export interface TransferHistoryEntry extends TransferItem {
  deviceName: string;
  roomName?: string;
}

export interface AppSettings {
  deviceName: string;
  chunkSize: number;
  autoAcceptTransfers: boolean;
  enableEncryption: boolean;
  theme: "dark" | "light" | "system";
  serverUrl: string;
  discoveryEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  deviceName: "OpenMesh Device",
  chunkSize: 256 * 1024,
  autoAcceptTransfers: false,
  enableEncryption: true,
  theme: "dark",
  serverUrl: "http://localhost:4000",
  discoveryEnabled: true,
};

export const SOCKET_EVENTS = {
  CONNECT: "connect",
  DISCONNECT: "disconnect",
  DEVICE_REGISTER: "device:register",
  DEVICE_LIST: "device:list",
  DEVICE_UPDATE: "device:update",
  DEVICE_DISCOVER: "device:discover",
  ROOM_CREATE: "room:create",
  ROOM_JOIN: "room:join",
  ROOM_LEAVE: "room:leave",
  ROOM_UPDATE: "room:update",
  ROOM_LIST: "room:list",
  SIGNAL_OFFER: "signal:offer",
  SIGNAL_ANSWER: "signal:answer",
  SIGNAL_ICE: "signal:ice",
  TRANSFER_START: "transfer:start",
  TRANSFER_PROGRESS: "transfer:progress",
  TRANSFER_COMPLETE: "transfer:complete",
  TRANSFER_ERROR: "transfer:error",
  TEXT_MESSAGE: "text:message",
  ERROR: "error",
} as const;

export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface HealthCheckResponse {
  status: "ok" | "degraded" | "down";
  version: string;
  uptime: number;
  connectedDevices: number;
  activeRooms: number;
}

export interface DeviceRegisterPayload {
  deviceId: string;
  deviceName: string;
  platform?: string;
}

export interface RoomCreatePayload {
  name: string;
  deviceId: string;
  deviceName: string;
}

export interface RoomJoinPayload {
  roomId: string;
  deviceId: string;
  deviceName: string;
}

export interface TextMessagePayload {
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
}

export interface WebRTCSignalPayload {
  roomId: string;
  fromDeviceId: string;
  toDeviceId: string;
  signal: Record<string, unknown>;
}

export const CHUNK_SIZE_OPTIONS = [
  { label: "64 KB", value: 64 * 1024 },
  { label: "256 KB", value: 256 * 1024 },
  { label: "1 MB", value: 1024 * 1024 },
  { label: "4 MB", value: 4 * 1024 * 1024 },
] as const;

export const APP_VERSION = "0.1.0";

export const PORTS = {
  WEB: 3000,
  SERVER: 4000,
} as const;
