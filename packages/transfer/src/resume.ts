import type { TransferManifest } from "./protocol.js";
import { getMissingIndexes } from "./stateStore.js";

export interface ResumeRequest {
  transferId: string;
  missingIndexes: number[];
}

export function buildResumeRequest(
  transferId: string,
  manifest: TransferManifest,
  receivedIndexes: Set<number>,
): ResumeRequest {
  return {
    transferId,
    missingIndexes: getMissingIndexes(manifest.totalChunks, receivedIndexes),
  };
}

export function shouldRequestResume(
  manifest: TransferManifest,
  receivedIndexes: Set<number>,
  completeReceived: boolean,
): boolean {
  if (!completeReceived) return false;
  return getMissingIndexes(manifest.totalChunks, receivedIndexes).length > 0;
}
