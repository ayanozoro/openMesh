import type { TransferManifest } from "./protocol.js";

const DB_NAME = "openmesh-transfers";
const DB_VERSION = 1;

export interface SenderState {
  transferId: string;
  peerId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize: number;
  totalChunks: number;
  nextIndex: number;
  ackedIndexes: number[];
  encryptionKeyB64: string;
  fileHash?: string;
  status: "active" | "paused" | "failed" | "completed" | "cancelled";
  createdAt: number;
  updatedAt: number;
}

export interface ReceiverState {
  transferId: string;
  fromPeerId: string;
  manifest: TransferManifest & { key?: string };
  receivedIndexes: number[];
  status: "active" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sender")) db.createObjectStore("sender", { keyPath: "transferId" });
      if (!db.objectStoreNames.contains("receiver")) db.createObjectStore("receiver", { keyPath: "transferId" });
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    tx.oncomplete = () => resolve(result ? (result as IDBRequest<T>).result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

export class TransferStateStore {
  async saveSenderState(state: SenderState): Promise<void> {
    try {
      await withStore("sender", "readwrite", (store) => store.put({ ...state, updatedAt: Date.now() }));
    } catch {
      // persistence is best-effort in non-browser environments
    }
  }

  async getSenderState(transferId: string): Promise<SenderState | null> {
    try {
      const result = await withStore<SenderState | undefined>("sender", "readonly", (store) => store.get(transferId));
      return result ?? null;
    } catch {
      return null;
    }
  }

  async listActiveSenderStates(): Promise<SenderState[]> {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("sender", "readonly");
        const store = tx.objectStore("sender");
        const request = store.getAll();
        request.onsuccess = () => {
          const all = (request.result as SenderState[]).filter((s) => s.status === "active" || s.status === "paused");
          resolve(all);
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  async removeSenderState(transferId: string): Promise<void> {
    try {
      await withStore("sender", "readwrite", (store) => store.delete(transferId));
    } catch {
      // ignore
    }
  }

  async saveReceiverState(state: ReceiverState): Promise<void> {
    try {
      await withStore("receiver", "readwrite", (store) => store.put({ ...state, updatedAt: Date.now() }));
    } catch {
      // ignore
    }
  }

  async getReceiverState(transferId: string): Promise<ReceiverState | null> {
    try {
      const result = await withStore<ReceiverState | undefined>("receiver", "readonly", (store) => store.get(transferId));
      return result ?? null;
    } catch {
      return null;
    }
  }

  async listActiveReceiverStates(): Promise<ReceiverState[]> {
    try {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("receiver", "readonly");
        const store = tx.objectStore("receiver");
        const request = store.getAll();
        request.onsuccess = () => {
          const all = (request.result as ReceiverState[]).filter((s) => s.status === "active");
          resolve(all);
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  async removeReceiverState(transferId: string): Promise<void> {
    try {
      await withStore("receiver", "readwrite", (store) => store.delete(transferId));
      await this.removeReceiverChunks(transferId);
    } catch {
      // ignore
    }
  }

  async saveReceiverChunk(transferId: string, index: number, data: ArrayBuffer): Promise<void> {
    try {
      await withStore("chunks", "readwrite", (store) => store.put(data, `${transferId}:${index}`));
    } catch {
      // ignore
    }
  }

  async getReceiverChunk(transferId: string, index: number): Promise<ArrayBuffer | null> {
    try {
      const result = await withStore<ArrayBuffer | undefined>("chunks", "readonly", (store) =>
        store.get(`${transferId}:${index}`),
      );
      return result ?? null;
    } catch {
      return null;
    }
  }

  async removeReceiverChunks(transferId: string): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("chunks", "readwrite");
        const store = tx.objectStore("chunks");
        const request = store.getAllKeys();
        request.onsuccess = () => {
          const prefix = `${transferId}:`;
          for (const key of request.result as string[]) {
            if (typeof key === "string" && key.startsWith(prefix)) store.delete(key);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // ignore
    }
  }
}

export function getMissingIndexes(totalChunks: number, received: Set<number>): number[] {
  const missing: number[] = [];
  for (let i = 0; i < totalChunks; i++) {
    if (!received.has(i)) missing.push(i);
  }
  return missing;
}
