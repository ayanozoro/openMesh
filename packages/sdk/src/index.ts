import { DEFAULT_SETTINGS, generateId, SOCKET_EVENTS } from "@openmesh/shared";
import type {
  AppSettings,
  Device,
  Room,
  TextMessagePayload,
  DeviceRegisterPayload,
  WebRTCSignalPayload,
} from "@openmesh/shared";
import { io, type Socket } from "socket.io-client";
import { createDefaultConfig } from "@openmesh/networking";
import PeerConnectionManager from "@openmesh/networking/src/peer-connection.js";
import { TransferManager } from "@openmesh/transfer/src/transferManager.js";

export interface OpenMeshOptions {
  serverUrl?: string;
  deviceName?: string;
  deviceId?: string;
}

export class OpenMesh {
  private _settings: AppSettings;
  private deviceId: string;
  private connected = false;
  private socket: Socket | null = null;
  private deviceUpdateCb: ((device: Device) => void) | null = null;
  private roomUpdateCb: ((room: Room) => void) | null = null;
  private peers: Map<string, PeerConnectionManager> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private dataMessageCb: ((from: string, payload: any) => void) | null = null;
  private transferManager: TransferManager;

  constructor(options: OpenMeshOptions = {}) {
    this.deviceId = options.deviceId ?? generateId("dev");
    this._settings = {
      ...DEFAULT_SETTINGS,
      serverUrl: options.serverUrl ?? DEFAULT_SETTINGS.serverUrl,
      deviceName: options.deviceName ?? DEFAULT_SETTINGS.deviceName,
    };
    this.transferManager = new TransferManager();
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    if (typeof btoa === "function") return btoa(binary);
    const Buf = (globalThis as any).Buffer;
    if (Buf && typeof Buf.from === "function") return Buf.from(buffer).toString("base64");
    return "";
  }

  getSettings(): AppSettings {
    return this._settings;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      try {
        const socket = io(this._settings.serverUrl, {
          transports: ["websocket", "polling"],
          reconnection: true,
        });

        this.socket = socket;

        socket.on("connect", () => {
          this.connected = true;

          const registerPayload: DeviceRegisterPayload = {
            deviceId: this.deviceId,
            deviceName: this._settings.deviceName,
            platform: typeof navigator !== "undefined" ? (navigator as any).platform : undefined,
          };

          socket.emit(SOCKET_EVENTS.DEVICE_REGISTER, registerPayload, (_resp: any) => {
            /* ignore */
          });

          socket.on(SOCKET_EVENTS.DEVICE_UPDATE, (d: Device) => {
            if (this.deviceUpdateCb) this.deviceUpdateCb(d);
          });

          socket.on(SOCKET_EVENTS.ROOM_UPDATE, (r: Room) => {
            if (this.roomUpdateCb) this.roomUpdateCb(r);
          });

          // WebRTC signaling handlers
          socket.on(SOCKET_EVENTS.SIGNAL_OFFER, async (payload: WebRTCSignalPayload) => {
            if (payload.toDeviceId !== this.deviceId) return;
            const from = payload.fromDeviceId;
            const pc = new PeerConnectionManager(createDefaultConfig(), {
              onIceCandidate: (candidate: RTCIceCandidateInit) => {
                socket.emit(SOCKET_EVENTS.SIGNAL_ICE, {
                  roomId: payload.roomId,
                  fromDeviceId: this.deviceId,
                  toDeviceId: from,
                  signal: candidate,
                });
              },
              onDataChannel: (dc: RTCDataChannel) => {
                this.dataChannels.set(from, dc);
                try { this.transferManager.attachDataChannel(from, dc); } catch (_) {}
                dc.onmessage = (ev: MessageEvent) => {
                  try {
                    const text = typeof ev.data === "string" ? ev.data : null;
                    const p = text ? JSON.parse(text) : ev.data;
                    // forward to transfer manager
                    try { this.transferManager.handleIncoming(from, p); } catch (_) {}
                    if (this.dataMessageCb) this.dataMessageCb(from, p);
                  } catch (_) {
                    try { this.transferManager.handleIncoming(from, ev.data); } catch (_) {}
                    if (this.dataMessageCb) this.dataMessageCb(from, ev.data);
                  }
                };
              },
            });

            this.peers.set(from, pc);

            const answer = await pc.handleOfferAndCreateAnswer(payload.signal as unknown as RTCSessionDescriptionInit);

            socket.emit(SOCKET_EVENTS.SIGNAL_ANSWER, {
              roomId: payload.roomId,
              fromDeviceId: this.deviceId,
              toDeviceId: from,
              signal: answer,
            });
          });

          socket.on(SOCKET_EVENTS.SIGNAL_ANSWER, async (payload: WebRTCSignalPayload) => {
            const from = payload.fromDeviceId;
            const pc = this.peers.get(from);
            if (!pc) return;
            await pc.handleAnswer(payload.signal as unknown as RTCSessionDescriptionInit);
          });

          socket.on(SOCKET_EVENTS.SIGNAL_ICE, async (payload: WebRTCSignalPayload) => {
            const from = payload.fromDeviceId;
            const pc = this.peers.get(from);
            if (!pc) return;
            await pc.addIceCandidate(payload.signal as unknown as RTCIceCandidateInit);
          });

          resolve();
        });

        socket.on("connect_error", (err) => reject(err));
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    this.connected = false;
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.peers.forEach((p) => p.close());
    this.peers.clear();
    this.dataChannels.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  sendText(content: string, roomId?: string): void {
    if (!this.connected || !this.socket) throw new Error("Not connected. Call connect() first.");

    const payload: TextMessagePayload = {
      roomId: roomId ?? "",
      senderId: this.deviceId,
      senderName: this._settings.deviceName,
      content,
      timestamp: new Date().toISOString(),
    };

    this.socket.emit(SOCKET_EVENTS.TEXT_MESSAGE, payload);
  }

  async startPeerConnection(toDeviceId: string, roomId: string): Promise<void> {
    if (!this.connected || !this.socket) throw new Error("Not connected. Call connect() first.");

    const pc = new PeerConnectionManager(createDefaultConfig(), {
      onIceCandidate: (candidate) => {
        this.socket?.emit(SOCKET_EVENTS.SIGNAL_ICE, {
          roomId,
          fromDeviceId: this.deviceId,
          toDeviceId,
          signal: candidate,
        });
      },
      onDataChannel: (dc) => {
        this.dataChannels.set(toDeviceId, dc);
        dc.onmessage = (ev) => {
          try {
            const text = typeof ev.data === "string" ? ev.data : null;
            const p = text ? JSON.parse(text) : ev.data;
            try { this.transferManager.handleIncoming(toDeviceId, p); } catch (_) {}
            if (this.dataMessageCb) this.dataMessageCb(toDeviceId, p);
          } catch (_) {
            try { this.transferManager.handleIncoming(toDeviceId, ev.data); } catch (_) {}
            if (this.dataMessageCb) this.dataMessageCb(toDeviceId, ev.data);
          }
        };
      },
    });

    // create local data channel so remote receives ondatachannel
    const dc = pc.createDataChannel("om-channel");
    this.dataChannels.set(toDeviceId, dc);
    try { this.transferManager.attachDataChannel(toDeviceId, dc); } catch (_) {}
    dc.onmessage = (ev) => {
      try {
        const text = typeof ev.data === "string" ? ev.data : null;
        const p = text ? JSON.parse(text) : ev.data;
        try { this.transferManager.handleIncoming(toDeviceId, p); } catch (_) {}
        if (this.dataMessageCb) this.dataMessageCb(toDeviceId, p);
      } catch (_) {
        try { this.transferManager.handleIncoming(toDeviceId, ev.data); } catch (_) {}
        if (this.dataMessageCb) this.dataMessageCb(toDeviceId, ev.data);
      }
    };

    this.peers.set(toDeviceId, pc);

    const offer = await pc.createOffer();

    this.socket.emit(SOCKET_EVENTS.SIGNAL_OFFER, {
      roomId,
      fromDeviceId: this.deviceId,
      toDeviceId,
      signal: offer,
    });
  }

  async sendFile(file: File, toDeviceId: string, roomId?: string): Promise<string> {
    if (!this.connected) throw new Error("Not connected. Call connect() first.");
    if (!toDeviceId) throw new Error("Target peer required for P2P file send.");

    if (!this.peers.has(toDeviceId)) await this.startPeerConnection(toDeviceId, roomId ?? "");

    const dc = this.dataChannels.get(toDeviceId);
    if (!dc) throw new Error("DataChannel not ready");

    // Use TransferManager for sending (managed lifecycle). This is a higher-level API
    // that currently sends chunk headers + binary payloads. Encryption integration
    // will be added in TransferManager in subsequent steps.

    const handle = await this.transferManager.sendFile(dc, file, { chunkSize: this._settings.chunkSize });
    return handle.transferId;
  }

  // Expose the transfer manager for advanced usage
  getTransferManager(): TransferManager {
    return this.transferManager;
  }

  onDeviceUpdate(cb: (device: Device) => void): void {
    this.deviceUpdateCb = cb;
  }

  onRoomUpdate(cb: (room: Room) => void): void {
    this.roomUpdateCb = cb;
  }

  onDataMessage(cb: (fromDeviceId: string, payload: any) => void): void {
    this.dataMessageCb = cb;
  }

  get events() {
    return SOCKET_EVENTS;
  }
}

export { SOCKET_EVENTS };
export type { Device, Room, AppSettings };
