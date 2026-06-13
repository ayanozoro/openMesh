import mongoose, { Schema } from "mongoose";
import type { Device, Room, RoomMember } from "@openmesh/shared";

// Device Schema
const DeviceSchema = new Schema<Device>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, required: true, enum: ["online", "offline", "connecting", "busy"] },
  connectionType: { type: String, required: true, enum: ["webrtc", "websocket", "lan"] },
  ipAddress: { type: String },
  lastSeen: { type: String, required: true },
  platform: { type: String },
});

export const DeviceModel = mongoose.model<Device>("Device", DeviceSchema);

// Room Member Schema
const RoomMemberSchema = new Schema<RoomMember>({
  deviceId: { type: String, required: true },
  deviceName: { type: String, required: true },
  role: { type: String, required: true, enum: ["owner", "member"] },
  joinedAt: { type: String, required: true },
});

// Room Schema
const RoomSchema = new Schema<Room>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  members: [RoomMemberSchema],
  createdAt: { type: String, required: true },
  createdBy: { type: String, required: true },
  isActive: { type: Boolean, required: true, default: true },
});

export const RoomModel = mongoose.model<Room>("Room", RoomSchema);
