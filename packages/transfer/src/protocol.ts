export enum TransferMessageType {
  META = "META",
  CHUNK = "CHUNK",
  ACK = "ACK",
  COMPLETE = "COMPLETE",
  ERROR = "ERROR",
  CANCEL = "CANCEL",
  RESUME = "RESUME",
}

export interface TransferManifest {
  transferId: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  chunkSize: number;
  totalChunks: number;
  // optional final file hash (hex/base64)
  fileHash?: string;
}

export interface MetaMessage {
  t: TransferMessageType.META;
  p: TransferManifest & { key?: string };
}

export interface ChunkMessage {
  t: TransferMessageType.CHUNK;
  p: {
    transferId: string;
    index: number;
    data: ArrayBuffer; // binary payload
  };
}

export interface AckMessage {
  t: TransferMessageType.ACK;
  p: { transferId: string; index: number };
}

export interface CompleteMessage {
  t: TransferMessageType.COMPLETE;
  p: { transferId: string };
}

export interface ErrorMessage {
  t: TransferMessageType.ERROR;
  p: { transferId?: string; code: string; message?: string };
}

export interface CancelMessage {
  t: TransferMessageType.CANCEL;
  p: { transferId: string; reason?: string };
}

export interface ResumeMessage {
  t: TransferMessageType.RESUME;
  p: { transferId: string; missingIndexes?: number[] };
}

export type TransferWireMessage = MetaMessage | ChunkMessage | AckMessage | CompleteMessage | ErrorMessage | CancelMessage | ResumeMessage;

export interface TransferOptions {
  chunkSize?: number;
  concurrent?: number; // number of in-flight chunks
  retryLimit?: number;
  ackTimeout?: number;
  maxBufferedAmount?: number; // bytes threshold for adaptive windowing
  peerId?: string;
  enableEncryption?: boolean;
  resumeFromIndex?: number;
  existingTransferId?: string;
  restoredAckedIndexes?: number[];
}

export type TransferState = "idle" | "sending" | "receiving" | "paused" | "completed" | "cancelled" | "error";
