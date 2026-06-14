import { DEFAULT_SETTINGS } from "@openmesh/shared";
import { TransferOptions, TransferManifest, TransferMessageType } from "./protocol.js";
import { generateKey, exportKey, importKey, encrypt, decrypt } from "@openmesh/encryption";

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export interface TransferHandle {
  transferId: string;
  pause: () => void;
  resume: () => void;
  cancel: (reason?: string) => void;
}

export class TransferManager extends EventTarget {
  private concurrent: number;
  private receptions: Map<string, {
    from?: string;
    manifest: any;
    cryptoKey?: CryptoKey;
    chunks: Map<number, ArrayBuffer>;
    receivedCount: number;
    completeReceived?: boolean;
    createdAt: number;
  }> = new Map();

  // queue of expected binary payloads (header order -> binary)
  private binaryExpectations: Array<{ transferId: string; index: number; length: number }> = [];

  // data channels by device id so receiver can send ACKs
  private dataChannels: Map<string, RTCDataChannel> = new Map();

  // pending sends waiting for ACKs: transferId -> index -> { buffer, retries, timeout }
  private pendingAcks: Map<string, Map<number, { buffer: ArrayBuffer; retries: number; timeoutId: any }>> = new Map();
  // EventTarget-based waiters for ACK/drain events per transfer
  private pendingWaiters: Map<string, EventTarget> = new Map();

  constructor() {
    super();
    this.concurrent = 1;
  }

  attachDataChannel(deviceId: string, dc: RTCDataChannel) {
    this.dataChannels.set(deviceId, dc);
  }

  detachDataChannel(deviceId: string) {
    this.dataChannels.delete(deviceId);
  }

  private waitForAckOrDrain(transferId: string, channel: RTCDataChannel): Promise<void> {
    return new Promise((resolve) => {
      const target = this.pendingWaiters.get(transferId) ?? new EventTarget();
      this.pendingWaiters.set(transferId, target);

      const onWake = () => {
        try { target.removeEventListener("wake", onWake); } catch (_) {}
        try { channel.removeEventListener("bufferedamountlow", onWake); } catch (_) {}
        resolve();
      };

      target.addEventListener("wake", onWake as EventListener);

      try { channel.addEventListener("bufferedamountlow", onWake as EventListener); } catch (_) {}
      // fallback: wake after 250ms to re-evaluate
      const t = setTimeout(() => {
        try { target.dispatchEvent(new Event("wake")); } catch (_) {}
      }, 250);
      // once resolved, clear fallback
      const cleanup = () => clearTimeout(t);
      target.addEventListener("wake", cleanup as EventListener);
    });
  }

  async sendFile(channel: RTCDataChannel, file: File, opts: TransferOptions = {}): Promise<TransferHandle> {
    const chunkSize = opts.chunkSize ?? DEFAULT_SETTINGS.chunkSize;
    const ackTimeout = opts.ackTimeout ?? 5000;
    const retryLimit = opts.retryLimit ?? 5;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const transferId = `t_${generateId()}`;

    const manifest: TransferManifest = {
      transferId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      chunkSize,
      totalChunks,
    };

    // create encryption key and attach to manifest
    const key = await generateKey();
    const rawKey = await exportKey(key);
    const base64Key = (function ab2b64(buf: ArrayBuffer) {
      if (typeof btoa === "function") {
        let binary = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      }
      const Buf = (globalThis as any).Buffer;
      if (Buf && typeof Buf.from === "function") return Buf.from(buf).toString("base64");
      throw new Error("No base64 encoder available");
    })(rawKey);

    (manifest as any).key = base64Key;

    // send META
    const meta = { t: TransferMessageType.META, p: manifest };
    channel.send(JSON.stringify(meta));

    let paused = false;
    let cancelled = false;

    const pause = () => {
      paused = true;
    };
    const resume = () => {
      if (!paused) return;
      paused = false;
    };
    const cancel = (reason?: string) => {
      cancelled = true;
      const msg = { t: TransferMessageType.CANCEL, p: { transferId, reason } };
      try {
        channel.send(JSON.stringify(msg));
      } catch (e) {
        // ignore
      }
    };

    // setup pendingAcks map for this transfer
    this.pendingAcks.set(transferId, new Map());

    const windowSize = opts.concurrent ?? 4;
    const maxBuffered = opts.maxBufferedAmount ?? chunkSize * 8;

    // set bufferedAmountLowThreshold to get notified when underlying buffer drains
    try {
      if (typeof (channel as any).bufferedAmountLowThreshold === "number") {
        (channel as any).bufferedAmountLowThreshold = Math.max(1, Math.floor(maxBuffered / 4));
      }
    } catch (_) {}

    // kickoff async send (fire-and-forget)
    (async () => {
      try {
        let offset = 0;
        let index = 0;
        while (offset < file.size) {
          if (cancelled) break;
          if (paused) {
            await new Promise<void>((resolve) => {
              const int = setInterval(() => {
                if (!paused || cancelled) {
                  clearInterval(int);
                  resolve();
                }
              }, 200);
            });
            if (cancelled) break;
          }

          // enforce adaptive in-flight window: wait while pending ACKs >= effectiveWindow
          const perTransfer = this.pendingAcks.get(transferId)!;
          while (true) {
            const buffered = channel.bufferedAmount ?? 0;
            const dynamicWindow = Math.max(1, Math.floor((maxBuffered - buffered) / chunkSize));
            const effectiveWindow = Math.max(1, Math.min(windowSize, dynamicWindow));
            if (perTransfer.size < effectiveWindow && buffered <= maxBuffered) break;

            // Wait until an ACK arrives or bufferedamountlow fires
            await this.waitForAckOrDrain(transferId, channel);
          }

          const end = Math.min(offset + chunkSize, file.size);
          const blob = file.slice(offset, end);
          const buffer = await blob.arrayBuffer();
          // encrypt chunk
          const encrypted = await encrypt(buffer, key);

          // send chunk header with encrypted length
          const header = JSON.stringify({ t: TransferMessageType.CHUNK, p: { transferId, index, length: (encrypted as ArrayBuffer).byteLength } });
          channel.send(header);
          channel.send(encrypted as ArrayBuffer);

          // track pending ack for this chunk
          const bufferCopy = (encrypted as ArrayBuffer).slice(0);
          const entry = { buffer: bufferCopy, retries: 0, timeoutId: null as any };
          perTransfer.set(index, entry);

          const scheduleTimeout = () => {
            entry.timeoutId = setTimeout(async () => {
              if (entry.retries >= retryLimit) {
                // give up
                this.dispatchEvent(new CustomEvent("transfer-error", { detail: { transferId, index, code: "ACK_TIMEOUT" } }));
                // cancel transfer
                try { channel.send(JSON.stringify({ t: TransferMessageType.CANCEL, p: { transferId, reason: "ACK_TIMEOUT" } })); } catch (_) {}
                perTransfer.delete(index);
                return;
              }
              // retransmit
              try {
                entry.retries++;
                channel.send(JSON.stringify({ t: TransferMessageType.CHUNK, p: { transferId, index, length: entry.buffer.byteLength } }));
                channel.send(entry.buffer);
                scheduleTimeout();
              } catch (e) {
                // ignore send error and retry later
                scheduleTimeout();
              }
            }, ackTimeout);
          };

          scheduleTimeout();

          // emit progress event
          this.dispatchEvent(new CustomEvent("progress", { detail: { transferId, index, offset: end, total: file.size } }));

          offset = end;
          index++;
        }

        if (!cancelled) {
          const complete = { t: TransferMessageType.COMPLETE, p: { transferId } };
          channel.send(JSON.stringify(complete));
          this.dispatchEvent(new CustomEvent("complete", { detail: { transferId } }));
        } else {
          this.dispatchEvent(new CustomEvent("cancelled", { detail: { transferId } }));
        }
      } catch (err) {
        const e = { t: TransferMessageType.ERROR, p: { transferId, code: "SEND_ERROR", message: String(err) } };
        try {
          channel.send(JSON.stringify(e));
        } catch (_) {}
        this.dispatchEvent(new CustomEvent("error", { detail: { transferId, error: err } }));
      }
    })();

    return { transferId, pause, resume, cancel };
  }

  // Placeholder for receiver wiring - apps will attach their own onmessage handlers
  // Handle incoming parsed payloads (JSON control messages) or raw ArrayBuffer
  handleIncoming(fromDeviceId: string, payload: any) {
    // control message (object with `t`)
    if (payload && typeof payload === "object" && typeof payload.t === "string") {
      const t = payload.t;
      switch (t) {
        case "META": {
          const manifest = payload.p;
          const transferId = manifest.transferId;
          // import key if present
          const base64Key = manifest.key;
          let cryptoKey: CryptoKey | undefined;
          if (base64Key) {
            try {
              const ab = (function b642ab(b64: string) {
                if (typeof atob === "function") {
                  const binary = atob(b64);
                  const len = binary.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
                  return bytes.buffer;
                }
                const Buf = (globalThis as any).Buffer;
                if (Buf && typeof Buf.from === "function") return Buf.from(b64, "base64").buffer;
                throw new Error("No base64 decoder available");
              })(base64Key);
              // import key asynchronously
              importKey(ab).then(async (k) => {
                const rec = this.receptions.get(transferId);
                if (rec) {
                  rec.cryptoKey = k;
                  // if any encrypted chunks arrived early, decrypt them now
                  if (rec.chunks.size > 0) {
                    const entries = Array.from(rec.chunks.entries());
                    rec.chunks.clear();
                    await Promise.all(entries.map(async ([idx, encBuf]) => {
                      try {
                        const dec = await decrypt(encBuf, k);
                        rec.chunks.set(idx, dec as ArrayBuffer);
                      } catch (_) {
                        // decryption failure on early chunk
                      }
                    }));
                    rec.receivedCount = rec.chunks.size;
                    if (rec.completeReceived && rec.receivedCount >= rec.manifest.totalChunks) {
                      this.assembleAndEmit(transferId, rec);
                    }
                  }
                }
              }).catch(() => {});
            } catch (_) {
              // ignore key import errors for now
            }
          }

          this.receptions.set(transferId, {
            from: fromDeviceId,
            manifest,
            cryptoKey,
            chunks: new Map(),
            receivedCount: 0,
            createdAt: Date.now(),
          });
          this.dispatchEvent(new CustomEvent("transfer-start", { detail: { from: fromDeviceId, transferId, manifest } }));
          break;
        }
        case "CHUNK": {
          const info = payload.p;
          if (!info || typeof info.transferId !== "string") return;
          this.binaryExpectations.push({ transferId: info.transferId, index: info.index, length: info.length });
          break;
        }
        case "ACK": {
          const info = payload.p;
          if (!info || typeof info.transferId !== "string") return;
          const perTransfer = this.pendingAcks.get(info.transferId);
          if (!perTransfer) return;
          const entry = perTransfer.get(info.index);
          if (entry) {
            if (entry.timeoutId) clearTimeout(entry.timeoutId);
            perTransfer.delete(info.index);
            // notify any waiters for this transfer via EventTarget
            const target = this.pendingWaiters.get(info.transferId);
            if (target) {
              try { target.dispatchEvent(new Event("wake")); } catch (_) {}
            }
          }
          break;
        }
        case "COMPLETE": {
          const transferId = payload.p?.transferId;
          const rec = this.receptions.get(transferId);
          if (!rec) return;
          rec.completeReceived = true;
          // if already have all chunks, assemble
          if (rec.receivedCount >= rec.manifest.totalChunks) {
            this.assembleAndEmit(transferId, rec);
          }
          break;
        }
        case "CANCEL": {
          const transferId = payload.p?.transferId;
          this.cleanupTransfer(transferId);
          this.dispatchEvent(new CustomEvent("transfer-cancelled", { detail: { from: fromDeviceId, transferId } }));
          break;
        }
        case "ERROR": {
          const transferId = payload.p?.transferId;
          this.dispatchEvent(new CustomEvent("transfer-error", { detail: { from: fromDeviceId, transferId, error: payload.p } }));
          this.cleanupTransfer(transferId);
          break;
        }
        default:
          // unknown control
          break;
      }
      return;
    }

    // binary payload (ArrayBuffer)
    if (payload instanceof ArrayBuffer || (ArrayBuffer.isView && ArrayBuffer.isView(payload))) {
      const buffer = payload instanceof ArrayBuffer ? payload : (payload.buffer as ArrayBuffer);
      if (this.binaryExpectations.length === 0) {
        // orphaned binary data - ignore
        return;
      }

      const expect = this.binaryExpectations.shift()!;
      const rec = this.receptions.get(expect.transferId);
      if (!rec) return;

      // If we have a cryptoKey, decrypt the buffer before storing
      if (rec.cryptoKey) {
        try {
          decrypt(buffer, rec.cryptoKey).then((decrypted) => {
            rec.chunks.set(expect.index, decrypted as ArrayBuffer);
            rec.receivedCount++;
            this.dispatchEvent(new CustomEvent("progress", { detail: { from: rec.from, transferId: expect.transferId, index: expect.index, receivedCount: rec.receivedCount, total: rec.manifest.totalChunks } }));

            // send ACK back to sender if channel attached
            try {
              const dc = rec.from ? this.dataChannels.get(rec.from) : undefined;
              if (dc && dc.readyState === "open") {
                dc.send(JSON.stringify({ t: TransferMessageType.ACK, p: { transferId: expect.transferId, index: expect.index } }));
              }
            } catch (_) {}

            if (rec.completeReceived && rec.receivedCount >= rec.manifest.totalChunks) {
              this.assembleAndEmit(expect.transferId, rec);
            }
          }).catch(() => {
            // decryption failed for this chunk
            this.dispatchEvent(new CustomEvent("transfer-error", { detail: { from: rec.from, transferId: expect.transferId, error: "DECRYPT_FAILED" } }));
            this.cleanupTransfer(expect.transferId);
          });
        } catch (e) {
          this.dispatchEvent(new CustomEvent("transfer-error", { detail: { from: rec.from, transferId: expect.transferId, error: e } }));
          this.cleanupTransfer(expect.transferId);
        }
      } else {
        // no crypto key yet — store raw and hope to decrypt later (unlikely)
        rec.chunks.set(expect.index, buffer);
        rec.receivedCount++;
        this.dispatchEvent(new CustomEvent("progress", { detail: { from: rec.from, transferId: expect.transferId, index: expect.index, receivedCount: rec.receivedCount, total: rec.manifest.totalChunks } }));

        if (rec.completeReceived && rec.receivedCount >= rec.manifest.totalChunks) {
          this.assembleAndEmit(expect.transferId, rec);
        }
      }
    }
  }

  private assembleAndEmit(transferId: string, rec: { manifest: any; chunks: Map<number, ArrayBuffer>; from?: string }) {
    const total = rec.manifest.totalChunks;
    const parts: BlobPart[] = [];
    for (let i = 0; i < total; i++) {
      const buf = rec.chunks.get(i);
      if (!buf) {
        // missing chunk, cannot assemble
        return;
      }
      parts.push(new Uint8Array(buf));
    }

    const blob = new Blob(parts, { type: rec.manifest.mimeType || "application/octet-stream" });
    // create File if available
    let file: File | undefined;
    try {
      file = new File([blob], rec.manifest.fileName || "file", { type: rec.manifest.mimeType || "application/octet-stream" });
    } catch (_) {
      // File constructor not available in some environments; fallback to blob
    }

    this.dispatchEvent(new CustomEvent("file-received", { detail: { from: rec.from, transferId, manifest: rec.manifest, file: file ?? blob } }));
    this.cleanupTransfer(transferId);
  }

  private cleanupTransfer(transferId?: string) {
    if (!transferId) return;
    this.receptions.delete(transferId);
    // remove any pending expectations for this transfer
    this.binaryExpectations = this.binaryExpectations.filter((e) => e.transferId !== transferId);
    // clear pending ACK timeouts and remove tracking
    const perTransfer = this.pendingAcks.get(transferId);
    if (perTransfer) {
      for (const entry of perTransfer.values()) {
        try { if (entry.timeoutId) clearTimeout(entry.timeoutId); } catch (_) {}
      }
      this.pendingAcks.delete(transferId);
    }

    // wake and remove any waiters for this transfer to avoid leaks
    const waiter = this.pendingWaiters.get(transferId);
    if (waiter) {
      try { waiter.dispatchEvent(new Event("wake")); } catch (_) {}
      this.pendingWaiters.delete(transferId);
    }
  }
}
