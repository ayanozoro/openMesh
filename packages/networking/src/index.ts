export interface PeerConnectionConfig {
  iceServers: RTCIceServer[];
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

export function createDefaultConfig(): PeerConnectionConfig {
  return { iceServers: DEFAULT_ICE_SERVERS };
}

export { PeerConnectionManager } from "./peer-connection.js";
