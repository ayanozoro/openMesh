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
import { TransferManager, type TransferHandle } from "@openmesh/transfer/src/transferManager.js";

export type { TransferHandle };

export interface OpenMeshOptions {
  serverUrl?: string;
  deviceName?: string;
  deviceId?: string;
}

export interface SendFileOptions {
  roomId?: string;
  chunkSize?: number;
  enableEncryption?: boolean;
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
  private dataMessageCb: ((from: string, payload: unknown) => void) | null = null;
  private transferManager: TransferManager;
  private fileCache: Map<string, File> = new Map();

  constructor(options: OpenMeshOptions = {}) {
    this.deviceId = options.deviceId ?? generateId("dev");
    this._settings = {
      ...DEFAULT_SETTINGS,
      serverUrl: options.serverUrl ?? DEFAULT_SETTINGS.serverUrl,
      deviceName: options.deviceName ?? DEFAULT_SETTINGS.deviceName,
    };
    this.transferManager = new TransferManager();
  }

  getSettings(): AppSettings {
    return this._settings;
  }

  updateSettings(updates: Partial<AppSettings>): void {
    this._settings = { ...this._settings, ...updates };
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
            platform: typeof navigator !== "undefined" ? (navigator as Navigator & { platform?: string }).platform : undefined,
          };

          socket.emit(SOCKET_EVENTS.DEVICE_REGISTER, registerPayload, () => { /* ignore */ });

          socket.on(SOCKET_EVENTS.DEVICE_UPDATE, (d: Device) => {
            if (this.deviceUpdateCb) this.deviceUpdateCb(d);
          });

          socket.on(SOCKET_EVENTS.ROOM_UPDATE, (r: Room) => {
            if (this.roomUpdateCb) this.roomUpdateCb(r);
          });

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
                this.wireDataChannel(from, dc);
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

  private wireDataChannel(peerId: string, dc: RTCDataChannel) {
    this.dataChannels.set(peerId, dc);
    this.transferManager.attachDataChannel(peerId, dc);
    dc.onmessage = (ev: MessageEvent) => {
      this.routeDataMessage(peerId, ev.data);
    };
  }

  private routeDataMessage(peerId: string, data: unknown) {
    try {
      const text = typeof data === "string" ? data : null;
      const p = text ? JSON.parse(text) : data;
      this.transferManager.handleIncoming(peerId, p);
      if (this.dataMessageCb) this.dataMessageCb(peerId, p);
    } catch {
      this.transferManager.handleIncoming(peerId, data);
      if (this.dataMessageCb) this.dataMessageCb(peerId, data);
    }
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

    if (this.peers.has(toDeviceId)) return;

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
        this.wireDataChannel(toDeviceId, dc);
      },
    });

    const dc = pc.createDataChannel("om-channel");
    this.wireDataChannel(toDeviceId, dc);

    this.peers.set(toDeviceId, pc);

    const offer = await pc.createOffer();

    this.socket.emit(SOCKET_EVENTS.SIGNAL_OFFER, {
      roomId,
      fromDeviceId: this.deviceId,
      toDeviceId,
      signal: offer,
    });
  }

  async sendFile(file: File, toDeviceId: string, options: SendFileOptions = {}): Promise<TransferHandle> {
    if (!this.connected) throw new Error("Not connected. Call connect() first.");
    if (!toDeviceId) throw new Error("Target peer required for P2P file send.");

    await this.startPeerConnection(toDeviceId, options.roomId ?? "");

    const dc = this.dataChannels.get(toDeviceId);
    if (!dc || dc.readyState !== "open") {
      await this.waitForDataChannel(toDeviceId);
    }

    const channel = this.dataChannels.get(toDeviceId);
    if (!channel) throw new Error("DataChannel not ready");

    const handle = await this.transferManager.sendFile(channel, file, {
      chunkSize: options.chunkSize ?? this._settings.chunkSize,
      enableEncryption: options.enableEncryption ?? this._settings.enableEncryption,
      peerId: toDeviceId,
    });

    this.fileCache.set(handle.transferId, file);
    return handle;
  }

  async retryFile(transferId: string, toDeviceId: string, file?: File, options: SendFileOptions = {}): Promise<TransferHandle> {
    const cached = file ?? this.fileCache.get(transferId);
    if (!cached) throw new Error("File not available for retry. Re-select the file.");

    await this.startPeerConnection(toDeviceId, options.roomId ?? "");
    const channel = this.dataChannels.get(toDeviceId);
    if (!channel) throw new Error("DataChannel not ready");

    const handle = await this.transferManager.retryTransfer(channel, cached, transferId, {
      chunkSize: options.chunkSize ?? this._settings.chunkSize,
      enableEncryption: options.enableEncryption ?? this._settings.enableEncryption,
      peerId: toDeviceId,
    });

    this.fileCache.set(handle.transferId, cached);
    return handle;
  }

  getTransferHandle(transferId: string): TransferHandle | undefined {
    return this.transferManager.getHandle(transferId);
  }

  cacheFileForTransfer(transferId: string, file: File): void {
    this.fileCache.set(transferId, file);
  }

  private waitForDataChannel(peerId: string, timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const dc = this.dataChannels.get(peerId);
        if (dc?.readyState === "open") {
          resolve();
          return;
        }
        if (Date.now() - start > timeoutMs) {
          reject(new Error("DataChannel connection timeout"));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  getTransferManager(): TransferManager {
    return this.transferManager;
  }

  onDeviceUpdate(cb: (device: Device) => void): void {
    this.deviceUpdateCb = cb;
  }

  onRoomUpdate(cb: (room: Room) => void): void {
    this.roomUpdateCb = cb;
  }

  onDataMessage(cb: (fromDeviceId: string, payload: unknown) => void): void {
    this.dataMessageCb = cb;
  }

  get events() {
    return SOCKET_EVENTS;
  }
}

export { SOCKET_EVENTS };
export type { Device, Room, AppSettings };
