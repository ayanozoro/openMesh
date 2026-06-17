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
import { createDefaultConfig, PeerConnectionManager } from "@openmesh/networking";
import { TransferManager, type TransferHandle } from "@openmesh/transfer";

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
  recipientPublicKeyB64?: string;
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

            // Check if we already have a peer connection for this device.
            // Use deterministic device-ID comparison to resolve glare:
            // the device with the HIGHER deviceId wins, the loser accepts the
            // winner's offer via rollback.  This prevents crossed/incompatible
            // SDP pairs that would prevent ICE from ever connecting.
            const existing = this.peers.get(from);
            if (existing) {
              const state = existing.getSignalingState();
              if (state === "stable") {
                if (existing.hasRemoteDescription()) {
                  console.warn(`[OpenMesh] Ignoring duplicate offer from ${from} (already negotiated)`);
                  return;
                }
                // No offer sent yet (startPeerConnection still in createOffer).
                // Higher deviceId wins — only the loser accepts the remote offer.
                if (this.deviceId > from) {
                  console.warn(`[OpenMesh] Glare win (pre-offer): ignoring ${from}`);
                  return;
                }
                // Loser — accept their offer below
              } else if (state === "have-remote-offer") {
                console.warn(`[OpenMesh] Ignoring duplicate offer from ${from} (state=have-remote-offer)`);
                return;
              } else if (state === "have-local-offer") {
                // Both sides sent offers simultaneously (glare).
                if (this.deviceId > from) {
                  console.warn(`[OpenMesh] Glare win: keeping our offer, ignoring ${from}`);
                  return;
                }
                // Loser — handleOfferAndCreateAnswer will rollback and accept theirs
              }
            }

            const pc = existing ?? new PeerConnectionManager(createDefaultConfig(), {
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

            if (!existing) {
              this.peers.set(from, pc);
            }

            try {
              const answer = await pc.handleOfferAndCreateAnswer(payload.signal as unknown as RTCSessionDescriptionInit);
              socket.emit(SOCKET_EVENTS.SIGNAL_ANSWER, {
                roomId: payload.roomId,
                fromDeviceId: this.deviceId,
                toDeviceId: from,
                signal: answer,
              });
            } catch (err) {
              console.warn(`[OpenMesh] Failed to handle offer from ${from}:`, err);
            }
          });

          socket.on(SOCKET_EVENTS.SIGNAL_ANSWER, async (payload: WebRTCSignalPayload) => {
            const from = payload.fromDeviceId;
            const pc = this.peers.get(from);
            if (!pc) return;
            try {
              await pc.handleAnswer(payload.signal as unknown as RTCSessionDescriptionInit);
            } catch (err) {
              // handleAnswer no longer throws, but catch defensively
              console.warn(`[OpenMesh] Failed to handle answer from ${from}:`, err);
            }
          });

          socket.on(SOCKET_EVENTS.SIGNAL_ICE, async (payload: WebRTCSignalPayload) => {
            const from = payload.fromDeviceId;
            const pc = this.peers.get(from);
            if (!pc) return;
            try {
              await pc.addIceCandidate(payload.signal as unknown as RTCIceCandidateInit);
            } catch (err) {
              // ICE candidate failures are non-fatal
              console.warn(`[OpenMesh] Failed to add ICE candidate from ${from}:`, err);
            }
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

    // tryCreateOffer returns null when a remote offer was already accepted
    // during the async yield (glare).  In that case we skip sending our own
    // offer — the connection is being established through the remote offer.
    const offer = await pc.tryCreateOffer();
    if (!offer) return;

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

    // IMPORTANT: Hold a stable reference to the data channel.
    // DO NOT re-fetch from this.dataChannels — the map entry can be
    // overwritten by wireDataChannel (via ondatachannel) during the
    // async wait, returning a different channel object that may not
    // be open yet.
    let channel = this.dataChannels.get(toDeviceId);
    if (!channel || channel.readyState !== "open") {
      await this.waitForDataChannel(toDeviceId);
      channel = this.dataChannels.get(toDeviceId);
    }
    if (!channel) throw new Error("DataChannel not ready");

    // Defensive: if the channel was replaced during the wait and the
    // replacement isn't open yet, wait for it directly.
    if (channel.readyState !== "open") {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("DataChannel not open after wait")), 5000);
        channel!.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }

    const handle = await this.transferManager.sendFile(channel, file, {
      chunkSize: options.chunkSize ?? this._settings.chunkSize,
      enableEncryption: options.enableEncryption ?? this._settings.enableEncryption,
      peerId: toDeviceId,
      recipientPublicKeyB64: options.recipientPublicKeyB64,
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
    const configuredTimeout = Number(process.env.OPENMESH_DATACHANNEL_TIMEOUT_MS ?? timeoutMs);

    return new Promise((resolve, reject) => {
      let finished = false;
      const start = Date.now();

      const done = (err?: Error) => {
        if (finished) return;
        finished = true;
        const dc = this.dataChannels.get(peerId);
        try { if (dc) dc.onopen = null as any; } catch { }
        try { if (dc) dc.onerror = null as any; } catch { }
        try { if (dc) dc.onclose = null as any; } catch { }
        if (err) reject(err); else resolve();
      };

      let trackedDc: RTCDataChannel | null = null;
      const wireEvents = () => {
        const dc = this.dataChannels.get(peerId);
        if (!dc) return;
        if (dc === trackedDc) return;
        if (dc.readyState === "open") { done(); return; }

        trackedDc = dc;
        dc.onopen = () => done() as any;
        dc.onerror = (() => {
          if (this.dataChannels.get(peerId) !== dc) return;
          done(new Error("DataChannel error while waiting for open"));
        }) as any;
        dc.onclose = (() => {
          if (this.dataChannels.get(peerId) !== dc) return;
          done(new Error(`DataChannel closed while waiting for open (state: ${dc.readyState})`));
        }) as any;
      };

      const poll = () => {
        if (finished) return;
        wireEvents();

        if (Date.now() - start > configuredTimeout) {
          const state = this.dataChannels.get(peerId)?.readyState ?? "none";
          console.debug(`[OpenMesh] DataChannel timeout for ${peerId}, state=${state}`);
          done(new Error("DataChannel connection timeout"));
          return;
        }

        setTimeout(poll, 100);
      };

      wireEvents();
      if (!finished) poll();
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
