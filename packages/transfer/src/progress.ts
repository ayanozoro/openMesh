export interface TransferProgress {
  bytesTransferred: number;
  totalBytes: number;
  progress: number;
  speed: number;
}

export function calculateProgress(bytesTransferred: number, totalBytes: number): TransferProgress {
  return {
    bytesTransferred,
    totalBytes,
    progress: totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 0,
    speed: 0,
  };
}
