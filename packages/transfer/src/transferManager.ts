import { DEFAULT_SETTINGS } from "@openmesh/shared";
import { ChunkManager } from "./chunkManager.js";
import { TransferOptions, TransferManifest, TransferMessageType } from "./protocol.js";
import { generateKey, exportKey, importKey, encrypt, decrypt, Sha256Hasher, wrapKeyWithPublicKey } from "@openmesh/encryption";
import { TransferStateStore, getMissingIndexes } from "./stateStore.js";
import { buildResumeRequest, shouldRequestResume } from "./resume.js";

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function ab2b64(buf: ArrayBuffer): string {
  if (typeof btoa === "function") {
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  const Buf = (globalThis as { Buffer?: { from: (b: ArrayBuffer) => { toString: (enc: string) => string } } }).Buffer;
  if (Buf && typeof Buf.from === "function") return Buf.from(buf).toString("base64");
  throw new Error("No base64 encoder available");
}

function b642ab(b64: string): ArrayBuffer {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  const Buf = (globalThis as { Buffer?: { from: (s: string, enc: string) => { buffer: ArrayBuffer } } }).Buffer;
  if (Buf && typeof Buf.from === "function") return Buf.from(b64, "base64").buffer;
  throw new Error("No base64 decoder available");
}

export interface TransferHandle {
  transferId: string;
  pause: () => void;
  resume: () => void;
  cancel: (reason?: string) => void;
}

interface SendContext {
  transferId: string;
  file: File;
  channel: RTCDataChannel;
  peerId?: string;
  key: CryptoKey | null;
  encryptionKeyB64?: string;
  manifest: TransferManifest;
  opts: TransferOptions;
  chunkSize: number;
  paused: boolean;
  cancelled: boolean;
  ackedIndexes: Set<number>;
  hasher: Sha256Hasher;
  fileHash?: string;
  sentIndexes: Set<number>;
}

interface Reception {
  from?: string;
  manifest: TransferManifest & { key?: string };
  cryptoKey?: CryptoKey;
  chunks: Map<number, ArrayBuffer>;
  receivedIndexes: Set<number>;
  completeReceived?: boolean;
  createdAt: number;
}

export class TransferManager extends EventTarget {
  private stateStore = new TransferStateStore();
  private receptions: Map<string, Reception> = new Map();
  private sends: Map<string, SendContext> = new Map();
  private handles: Map<string, TransferHandle> = new Map();

  private binaryExpectations: Array<{ transferId: string; index: number; length: number }> = [];
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private pendingAcks: Map<string, Map<number, { buffer: ArrayBuffer; retries: number; timeoutId: ReturnType<typeof setTimeout> | null }>> = new Map();
  private pendingWaiters: Map<string, EventTarget> = new Map();

  constructor() {
    super();
  }

  attachDataChannel(deviceId: string, dc: RTCDataChannel) {
    this.dataChannels.set(deviceId, dc);
    void this.resumeInterruptedReceives(deviceId, dc);
  }

  detachDataChannel(deviceId: string) {
    this.dataChannels.delete(deviceId);
  }

  getHandle(transferId: string): TransferHandle | undefined {
    return this.handles.get(transferId);
  }

  private waitForChannelOpen(channel: RTCDataChannel, timeoutMs = 30000): Promise<void> {
    if (channel.readyState === "open") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        const err = new Error(`DataChannel did not open within ${timeoutMs}ms (state: ${channel.readyState})`);
        this.dispatchEvent(new CustomEvent('channel-timeout', { detail: { error: err } }));
        reject(err);
      }, timeoutMs);

      const onOpen = () => { cleanup(); resolve(); };
      const onClose = () => { cleanup(); const err = new Error(`DataChannel closed before opening (state: ${channel.readyState})`); this.dispatchEvent(new CustomEvent('channel-timeout', { detail: { error: err } })); reject(err); };
      const onError = () => { cleanup(); const err = new Error("DataChannel error while waiting for open"); this.dispatchEvent(new CustomEvent('channel-timeout', { detail: { error: err } })); reject(err); };

      channel.addEventListener("open", onOpen);
      channel.addEventListener("close", onClose);
      channel.addEventListener("error", onError);

      function cleanup() {
        clearTimeout(timer);
        channel.removeEventListener("open", onOpen);
        channel.removeEventListener("close", onClose);
        channel.removeEventListener("error", onError);
      }
    });
  }

  private waitForAckOrDrain(transferId: string, channel: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      const target = this.pendingWaiters.get(transferId) ?? new EventTarget();
      this.pendingWaiters.set(transferId, target);

      const onWake = () => {
        try { target.removeEventListener("wake", onWake); } catch (_) { /* ignore */ }
        try { channel.removeEventListener("bufferedamountlow", onWake); } catch (_) { /* ignore */ }
        resolve();
      };

      target.addEventListener("wake", onWake as EventListener);
      try { channel.addEventListener("bufferedamountlow", onWake as EventListener); } catch (_) { /* ignore */ }

      const t = setTimeout(() => {
        try { target.dispatchEvent(new Event("wake")); } catch (_) { /* ignore */ }
      }, 250);
      const cleanup = () => clearTimeout(t);
      target.addEventListener("wake", cleanup as EventListener);
    });
  }

  async sendFile(channel: RTCDataChannel, file: File, opts: TransferOptions = {}): Promise<TransferHandle> {
    // Wait for the data channel to be open before sending anything
    try {
      await this.waitForChannelOpen(channel);
    } catch (e) {
      // Emit a transfer-error event for the caller UI
      this.dispatchEvent(new CustomEvent('transfer-error', { detail: { error: e, code: 'CHANNEL_TIMEOUT' } }));
      throw e;
    }

    const requestedChunkSize = opts.chunkSize ?? DEFAULT_SETTINGS.chunkSize;
    const ackTimeout = opts.ackTimeout ?? 5000;
    const retryLimit = opts.retryLimit ?? 5;
    let enableEncryption = opts.enableEncryption ?? true;
    // Respect underlying DataChannel maxMessageSize to avoid
    // "Trying to send message larger than max-message-size" errors in browsers.
    // Chrome exposes 256 KB, Firefox returns null (actual limit 64 KB), Safari ~256 KB.
    // Always cap chunkSize strictly below maxMessageSize to leave headroom for
    // AES-GCM encryption overhead (28 bytes) and JSON framing.
    let chunkSize = requestedChunkSize;
    let maxMsgSize = 0;
    try {
      const val = (channel as unknown as { maxMessageSize?: unknown }).maxMessageSize;
      if (typeof val === "number" && val > 0) {
        maxMsgSize = val;
      } else if (val == null) {
        // Firefox returns null; use 64 KB as safe default
        maxMsgSize = 64 * 1024;
      }
    } catch (_) {
      // property access failed
    }
    if (maxMsgSize <= 0) {
      maxMsgSize = 64 * 1024;
    }
    // Always cap unconditionally with generous safety margin.
    // Some browsers (Firefox, older Safari) have effective limits lower
    // than the reported maxMessageSize; a 16 KB margin guarantees safety.
    const SAFETY_MARGIN = 16 * 1024;
    const effectiveMaxSend = Math.max(16384, maxMsgSize - SAFETY_MARGIN);
    if (chunkSize > effectiveMaxSend) {
      chunkSize = effectiveMaxSend;
      console.warn(`[TransferManager] Capped chunkSize from ${requestedChunkSize} to ${chunkSize} (maxMessageSize=${maxMsgSize}, margin=16KB)`);
    }

    const chunkManager = new ChunkManager({ chunkSize });
    const totalChunks = chunkManager.getTotalChunks(file.size);
    const transferId = opts.existingTransferId ?? `t_${generateId()}`;

    const manifest: TransferManifest = {
      transferId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      chunkSize,
      totalChunks,
    };

    let key: CryptoKey | null = null;
    let encryptionKeyB64: string | undefined;

    const hasWebCrypto = typeof globalThis.crypto !== "undefined" && typeof (globalThis.crypto as { subtle?: unknown }).subtle !== "undefined";
    if (enableEncryption) {
      if (!hasWebCrypto) {
        console.warn("[TransferManager] Web Crypto API unavailable (insecure context). Falling back to unencrypted transfer.");
        enableEncryption = false;
        opts.enableEncryption = false;
      } else {
        key = await generateKey();
        const rawKey = await exportKey(key);
        const rawKeyB64 = ab2b64(rawKey);
        if (opts.recipientPublicKeyB64) {
          try {
            const recipientPub = b642ab(opts.recipientPublicKeyB64);
            const wrapped = await wrapKeyWithPublicKey(rawKey, recipientPub);
            encryptionKeyB64 = wrapped;
          } catch (_) {
            encryptionKeyB64 = rawKeyB64;
          }
        } else {
          encryptionKeyB64 = rawKeyB64;
        }
        (manifest as TransferManifest & { key?: string }).key = encryptionKeyB64;
      }
    }

    if (channel.readyState !== "open") {
      const err = new Error(`Cannot send META: DataChannel state is "${channel.readyState}"`);
      this.dispatchEvent(new CustomEvent('transfer-error', { detail: { error: err, code: 'CHANNEL_NOT_OPEN' } }));
      throw err;
    }
    const meta = { t: TransferMessageType.META, p: manifest };
    channel.send(JSON.stringify(meta));

    const hasher = new Sha256Hasher();
    const sendCtx: SendContext = {
      transferId,
      file,
      channel,
      peerId: opts.peerId,
      key,
      encryptionKeyB64,
      manifest,
      opts,
      chunkSize,
      paused: false,
      cancelled: false,
      ackedIndexes: new Set(opts.restoredAckedIndexes ?? []),
      hasher,
      sentIndexes: new Set(),
    };

    this.sends.set(transferId, sendCtx);
    this.pendingAcks.set(transferId, new Map());

    const pause = () => {
      sendCtx.paused = true;
      void this.persistSenderState(sendCtx, "paused");
      this.dispatchEvent(new CustomEvent("transfer-paused", { detail: { transferId } }));
    };

    const resume = () => {
      if (!sendCtx.paused) return;
      sendCtx.paused = false;
      void this.persistSenderState(sendCtx, "active");
      this.dispatchEvent(new CustomEvent("transfer-resumed", { detail: { transferId } }));
    };

    const cancel = (reason?: string) => {
      sendCtx.cancelled = true;
      sendCtx.paused = false;
      const msg = { t: TransferMessageType.CANCEL, p: { transferId, reason } };
      try { channel.send(JSON.stringify(msg)); } catch (_) { /* ignore */ }
      void this.stateStore.removeSenderState(transferId);
      this.dispatchEvent(new CustomEvent("cancelled", { detail: { transferId, reason } }));
    };

    const handle: TransferHandle = { transferId, pause, resume, cancel };
    this.handles.set(transferId, handle);

    const windowSize = opts.concurrent ?? 4;
    const maxBuffered = opts.maxBufferedAmount ?? chunkSize * 8;
    const resumeFrom = opts.resumeFromIndex ?? 0;

    try {
      if (typeof (channel as RTCDataChannel & { bufferedAmountLowThreshold?: number }).bufferedAmountLowThreshold === "number") {
        (channel as RTCDataChannel & { bufferedAmountLowThreshold: number }).bufferedAmountLowThreshold = Math.max(1, Math.floor(maxBuffered / 4));
      }
    } catch (_) { /* ignore */ }

    void (async () => {
      try {
        for await (const chunk of chunkManager.readChunks(file)) {
          if (chunk.index < resumeFrom) {
            hasher.update(chunk.data);
            continue;
          }

          if (sendCtx.cancelled) break;

          while (sendCtx.paused && !sendCtx.cancelled) {
            await new Promise<void>((resolve) => setTimeout(resolve, 200));
          }
          if (sendCtx.cancelled) break;

          if (sendCtx.ackedIndexes.has(chunk.index) || sendCtx.sentIndexes.has(chunk.index)) {
            hasher.update(chunk.data);
            continue;
          }

          const perTransfer = this.pendingAcks.get(transferId)!;
          while (true) {
            const buffered = channel.bufferedAmount ?? 0;
            const dynamicWindow = Math.max(1, Math.floor((maxBuffered - buffered) / chunkSize));
            const effectiveWindow = Math.max(1, Math.min(windowSize, dynamicWindow));
            if (perTransfer.size < effectiveWindow && buffered <= maxBuffered) break;
            await this.waitForAckOrDrain(transferId, channel);
          }

          hasher.update(chunk.data);
          await this.sendChunk(sendCtx, chunk.index, chunk.data, ackTimeout, retryLimit);

          this.dispatchEvent(new CustomEvent("progress", {
            detail: {
              transferId,
              index: chunk.index,
              offset: chunk.offset + (chunk.data.byteLength),
              total: file.size,
              ackedCount: sendCtx.ackedIndexes.size,
              totalChunks,
            },
          }));

          void this.persistSenderState(sendCtx, sendCtx.paused ? "paused" : "active");
        }

        if (!sendCtx.cancelled) {
          sendCtx.fileHash = hasher.digest();
          manifest.fileHash = sendCtx.fileHash;

          while (this.pendingAcks.get(transferId)?.size) {
            await this.waitForAckOrDrain(transferId, channel);
          }

          const complete = { t: TransferMessageType.COMPLETE, p: { transferId, fileHash: sendCtx.fileHash } };
          channel.send(JSON.stringify(complete));
          await this.stateStore.removeSenderState(transferId);
          this.sends.delete(transferId);
          this.handles.delete(transferId);
          this.dispatchEvent(new CustomEvent("complete", { detail: { transferId, fileHash: sendCtx.fileHash } }));
        } else {
          this.sends.delete(transferId);
          this.handles.delete(transferId);
        }
      } catch (err) {
        const e = { t: TransferMessageType.ERROR, p: { transferId, code: "SEND_ERROR", message: String(err) } };
        try { channel.send(JSON.stringify(e)); } catch (_) { /* ignore */ }
        void this.persistSenderState(sendCtx, "failed");
        this.dispatchEvent(new CustomEvent("error", { detail: { transferId, error: err } }));
      }
    })();

    return handle;
  }

  async retryTransfer(channel: RTCDataChannel, file: File, transferId: string, opts: TransferOptions = {}): Promise<TransferHandle> {
    const saved = await this.stateStore.getSenderState(transferId);
    const acked = saved?.ackedIndexes ?? [];
    const missing = saved ? getMissingIndexes(saved.totalChunks, new Set(acked)) : [];
    const resumeFrom = missing.length > 0 ? missing[0] : 0;

    return this.sendFile(channel, file, {
      ...opts,
      existingTransferId: transferId,
      resumeFromIndex: resumeFrom,
      restoredAckedIndexes: acked,
    });
  }

  private async sendChunk(
    ctx: SendContext,
    index: number,
    data: ArrayBuffer,
    ackTimeout: number,
    retryLimit: number,
  ): Promise<void> {
    const { transferId, channel, key, opts } = ctx;
    const enableEncryption = opts.enableEncryption ?? true;
    let payload = data;

    if (enableEncryption && key) {
      payload = (await encrypt(data, key)) as ArrayBuffer;
    }

    const header = JSON.stringify({
      t: TransferMessageType.CHUNK,
      p: { transferId, index, length: payload.byteLength },
    });

    const chMaxSize = (ctx.channel as unknown as { maxMessageSize?: number }).maxMessageSize;
    const limit = typeof chMaxSize === "number" && chMaxSize > 0 ? chMaxSize : 64 * 1024;
    if (payload.byteLength > limit) {
      throw new Error(
        `Chunk ${index} payload (${payload.byteLength}B) exceeds DataChannel maxMessageSize (${limit}). ` +
        `Reduce chunkSize to avoid "Trying to send message larger than max-message-size".`
      );
    }

    try {
      channel.send(header);
      channel.send(payload);
    } catch (err: unknown) {
      // Even with capping, the browser's actual limit may be lower than
      // the reported maxMessageSize.  Throw a clear error so the caller
      // can report it to the user.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("max-message-size") || msg.includes("larger than")) {
        throw new Error(
          `Failed to send chunk ${index} (${payload.byteLength}B). ` +
          `Browser rejected the message — try a smaller chunkSize setting.`
        );
      }
      throw err;
    }

    ctx.sentIndexes.add(index);

    const perTransfer = this.pendingAcks.get(transferId)!;
    const bufferCopy = payload.slice(0);
    const entry = { buffer: bufferCopy, retries: 0, timeoutId: null as ReturnType<typeof setTimeout> | null };
    perTransfer.set(index, entry);

    const scheduleTimeout = () => {
      entry.timeoutId = setTimeout(async () => {
        if (entry.retries >= retryLimit) {
          this.dispatchEvent(new CustomEvent("transfer-error", { detail: { transferId, index, code: "ACK_TIMEOUT" } }));
          try { channel.send(JSON.stringify({ t: TransferMessageType.CANCEL, p: { transferId, reason: "ACK_TIMEOUT" } })); } catch (_) { /* ignore */ }
          perTransfer.delete(index);
          void this.persistSenderState(ctx, "failed");
          return;
        }
        try {
          entry.retries++;
          channel.send(JSON.stringify({ t: TransferMessageType.CHUNK, p: { transferId, index, length: entry.buffer.byteLength } }));
          channel.send(entry.buffer);
          scheduleTimeout();
        } catch (_) {
          scheduleTimeout();
        }
      }, ackTimeout);
    };

    scheduleTimeout();
  }

  private async resendChunks(ctx: SendContext, indexes: number[]): Promise<void> {
    const ackTimeout = ctx.opts.ackTimeout ?? 5000;
    const retryLimit = ctx.opts.retryLimit ?? 5;

    for (const index of indexes) {
      if (ctx.ackedIndexes.has(index)) continue;
      const offset = index * ctx.chunkSize;
      const end = Math.min(offset + ctx.chunkSize, ctx.file.size);
      const buffer = await ctx.file.slice(offset, end).arrayBuffer();
      await this.sendChunk(ctx, index, buffer, ackTimeout, retryLimit);
    }
  }

  private async persistSenderState(ctx: SendContext, status: "active" | "paused" | "failed"): Promise<void> {
    if (!ctx.encryptionKeyB64) return;
    await this.stateStore.saveSenderState({
      transferId: ctx.transferId,
      peerId: ctx.peerId ?? "",
      fileName: ctx.file.name,
      fileSize: ctx.file.size,
      mimeType: ctx.file.type,
      chunkSize: ctx.chunkSize,
      totalChunks: ctx.manifest.totalChunks,
      nextIndex: ctx.sentIndexes.size,
      ackedIndexes: Array.from(ctx.ackedIndexes),
      encryptionKeyB64: ctx.encryptionKeyB64,
      fileHash: ctx.fileHash,
      status,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  async resumeInterruptedReceives(peerId: string, channel: RTCDataChannel): Promise<void> {
    const states = await this.stateStore.listActiveReceiverStates();
    for (const state of states.filter((s) => s.fromPeerId === peerId)) {
      const req = buildResumeRequest(state.transferId, state.manifest, new Set(state.receivedIndexes));
      if (req.missingIndexes.length > 0 && channel.readyState === "open") {
        channel.send(JSON.stringify({ t: TransferMessageType.RESUME, p: req }));
      }
    }
  }

  handleIncoming(fromDeviceId: string, payload: unknown) {
    if (payload && typeof payload === "object" && "t" in payload && typeof (payload as { t: string }).t === "string") {
      const msg = payload as { t: string; p?: Record<string, unknown> };
      switch (msg.t) {
        case TransferMessageType.META:
          this.handleMeta(fromDeviceId, msg.p as unknown as TransferManifest & { key?: string });
          break;
        case TransferMessageType.CHUNK:
          this.handleChunkHeader(msg.p as { transferId: string; index: number; length: number });
          break;
        case TransferMessageType.ACK:
          this.handleAck(msg.p as { transferId: string; index: number });
          break;
        case TransferMessageType.COMPLETE:
          void this.handleComplete(fromDeviceId, msg.p as { transferId: string; fileHash?: string });
          break;
        case TransferMessageType.CANCEL:
          this.handleCancel(fromDeviceId, msg.p as { transferId: string });
          break;
        case TransferMessageType.ERROR:
          this.handleError(fromDeviceId, msg.p as { transferId?: string });
          break;
        case TransferMessageType.RESUME:
          void this.handleResume(msg.p as { transferId: string; missingIndexes?: number[] });
          break;
        default:
          break;
      }
      return;
    }

    if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
      void this.handleBinary(payload);
    }
  }

  private handleMeta(fromDeviceId: string, manifest: TransferManifest & { key?: string }) {
    const transferId = manifest.transferId;
    const base64Key = manifest.key;

    const rec: Reception = {
      from: fromDeviceId,
      manifest,
      chunks: new Map(),
      receivedIndexes: new Set(),
      createdAt: Date.now(),
    };
    this.receptions.set(transferId, rec);

    void this.stateStore.saveReceiverState({
      transferId,
      fromPeerId: fromDeviceId,
      manifest,
      receivedIndexes: [],
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (base64Key) {
      const hasWebCrypto = typeof globalThis.crypto !== "undefined" && typeof (globalThis.crypto as { subtle?: unknown }).subtle !== "undefined";
      if (!hasWebCrypto) {
        this.dispatchEvent(new CustomEvent("transfer-error", {
          detail: { from: fromDeviceId, transferId, error: "Web Crypto API unavailable (insecure context). Cannot decrypt." },
        }));
        this.cleanupTransfer(transferId);
        void this.stateStore.removeReceiverState(transferId);
        return;
      }
      importKey(b642ab(base64Key)).then((k) => {
        const r = this.receptions.get(transferId);
        if (r) r.cryptoKey = k;
      }).catch(() => { /* ignore */ });
    }

    this.dispatchEvent(new CustomEvent("transfer-start", { detail: { from: fromDeviceId, transferId, manifest } }));
  }

  private handleChunkHeader(info: { transferId: string; index: number; length: number }) {
    if (!info?.transferId) return;
    this.binaryExpectations.push({ transferId: info.transferId, index: info.index, length: info.length });
  }

  private handleAck(info: { transferId: string; index: number }) {
    if (!info?.transferId) return;
    const perTransfer = this.pendingAcks.get(info.transferId);
    if (!perTransfer) return;

    const entry = perTransfer.get(info.index);
    if (entry) {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
      perTransfer.delete(info.index);
    }

    const sendCtx = this.sends.get(info.transferId);
    if (sendCtx) {
      sendCtx.ackedIndexes.add(info.index);
      void this.persistSenderState(sendCtx, sendCtx.paused ? "paused" : "active");
    }

    const target = this.pendingWaiters.get(info.transferId);
    if (target) {
      try { target.dispatchEvent(new Event("wake")); } catch (_) { /* ignore */ }
    }
  }

  private async handleComplete(fromDeviceId: string, info: { transferId: string; fileHash?: string }) {
    const transferId = info?.transferId;
    const rec = transferId ? this.receptions.get(transferId) : undefined;
    if (!rec || !transferId) return;

    rec.completeReceived = true;
    rec.manifest.fileHash = info.fileHash ?? rec.manifest.fileHash;

    if (shouldRequestResume(rec.manifest, rec.receivedIndexes, true)) {
      const dc = this.dataChannels.get(fromDeviceId);
      const req = buildResumeRequest(transferId, rec.manifest, rec.receivedIndexes);
      if (dc?.readyState === "open") {
        dc.send(JSON.stringify({ t: TransferMessageType.RESUME, p: req }));
      }
      return;
    }

    if (rec.receivedIndexes.size >= rec.manifest.totalChunks) {
      await this.assembleAndEmit(transferId, rec);
    }
  }

  private handleCancel(fromDeviceId: string, info: { transferId: string }) {
    const transferId = info?.transferId;
    if (!transferId) return;
    this.cleanupTransfer(transferId);
    void this.stateStore.removeReceiverState(transferId);
    this.dispatchEvent(new CustomEvent("transfer-cancelled", { detail: { from: fromDeviceId, transferId } }));
  }

  private handleError(fromDeviceId: string, info: { transferId?: string }) {
    const transferId = info?.transferId;
    this.dispatchEvent(new CustomEvent("transfer-error", { detail: { from: fromDeviceId, transferId, error: info } }));
    if (transferId) {
      this.cleanupTransfer(transferId);
      void this.stateStore.removeReceiverState(transferId);
    }
  }

  private async handleResume(info: { transferId: string; missingIndexes?: number[] }) {
    const sendCtx = this.sends.get(info.transferId);
    if (!sendCtx || sendCtx.cancelled) return;

    const missing = info.missingIndexes ?? getMissingIndexes(
      sendCtx.manifest.totalChunks,
      sendCtx.ackedIndexes,
    );

    if (missing.length === 0) return;
    await this.resendChunks(sendCtx, missing);
  }

  private async handleBinary(payload: ArrayBuffer | ArrayBufferView) {
    const buffer = payload instanceof ArrayBuffer ? payload : (payload.buffer as ArrayBuffer);
    if (this.binaryExpectations.length === 0) return;

    const expect = this.binaryExpectations.shift()!;
    const rec = this.receptions.get(expect.transferId);
    if (!rec) return;

    const storeChunk = async (index: number, data: ArrayBuffer) => {
      rec.chunks.set(index, data);
      rec.receivedIndexes.add(index);
      await this.stateStore.saveReceiverChunk(expect.transferId, index, data);
      await this.stateStore.saveReceiverState({
        transferId: expect.transferId,
        fromPeerId: rec.from ?? "",
        manifest: rec.manifest,
        receivedIndexes: Array.from(rec.receivedIndexes),
        status: "active",
        createdAt: rec.createdAt,
        updatedAt: Date.now(),
      });

      this.dispatchEvent(new CustomEvent("progress", {
        detail: {
          from: rec.from,
          transferId: expect.transferId,
          index,
          receivedCount: rec.receivedIndexes.size,
          total: rec.manifest.totalChunks,
        },
      }));

      try {
        const dc = rec.from ? this.dataChannels.get(rec.from) : undefined;
        if (dc?.readyState === "open") {
          dc.send(JSON.stringify({ t: TransferMessageType.ACK, p: { transferId: expect.transferId, index } }));
        }
      } catch (_) { /* ignore */ }

      if (rec.completeReceived && rec.receivedIndexes.size >= rec.manifest.totalChunks) {
        await this.assembleAndEmit(expect.transferId, rec);
      }
    };

    if (rec.cryptoKey) {
      try {
        const decrypted = (await decrypt(buffer, rec.cryptoKey)) as ArrayBuffer;
        await storeChunk(expect.index, decrypted);
      } catch {
        this.dispatchEvent(new CustomEvent("transfer-error", { detail: { from: rec.from, transferId: expect.transferId, error: "DECRYPT_FAILED" } }));
        this.cleanupTransfer(expect.transferId);
        void this.stateStore.removeReceiverState(expect.transferId);
      }
    } else {
      await storeChunk(expect.index, buffer);
    }
  }

  private async assembleAndEmit(transferId: string, rec: Reception) {
    const total = rec.manifest.totalChunks;
    const parts: BlobPart[] = [];

    for (let i = 0; i < total; i++) {
      let buf = rec.chunks.get(i);
      if (!buf) {
        buf = (await this.stateStore.getReceiverChunk(transferId, i)) ?? undefined;
      }
      if (!buf) return;
      parts.push(new Uint8Array(buf));
    }

    const blob = new Blob(parts, { type: rec.manifest.mimeType || "application/octet-stream" });

    if (rec.manifest.fileHash) {
      const hasher = new Sha256Hasher();
      for (let i = 0; i < total; i++) {
        const buf = rec.chunks.get(i) ?? (await this.stateStore.getReceiverChunk(transferId, i));
        if (buf) hasher.update(buf);
      }
      const computed = hasher.digest();
      if (computed !== rec.manifest.fileHash) {
        this.dispatchEvent(new CustomEvent("transfer-error", {
          detail: { from: rec.from, transferId, error: "HASH_MISMATCH", expected: rec.manifest.fileHash, actual: computed },
        }));
        this.cleanupTransfer(transferId);
        void this.stateStore.removeReceiverState(transferId);
        return;
      }
    }

    let file: File | undefined;
    try {
      file = new File([blob], rec.manifest.fileName || "file", { type: rec.manifest.mimeType || "application/octet-stream" });
    } catch (_) { /* File constructor unavailable */ }

    this.dispatchEvent(new CustomEvent("file-received", {
      detail: { from: rec.from, transferId, manifest: rec.manifest, file: file ?? blob, checksum: rec.manifest.fileHash },
    }));

    this.cleanupTransfer(transferId);
    void this.stateStore.removeReceiverState(transferId);
  }

  private cleanupTransfer(transferId?: string) {
    if (!transferId) return;
    this.receptions.delete(transferId);
    this.sends.delete(transferId);
    this.handles.delete(transferId);
    this.binaryExpectations = this.binaryExpectations.filter((e) => e.transferId !== transferId);

    const perTransfer = this.pendingAcks.get(transferId);
    if (perTransfer) {
      for (const entry of perTransfer.values()) {
        try { if (entry.timeoutId) clearTimeout(entry.timeoutId); } catch (_) { /* ignore */ }
      }
      this.pendingAcks.delete(transferId);
    }

    const waiter = this.pendingWaiters.get(transferId);
    if (waiter) {
      try { waiter.dispatchEvent(new Event("wake")); } catch (_) { /* ignore */ }
      this.pendingWaiters.delete(transferId);
    }
  }
}
