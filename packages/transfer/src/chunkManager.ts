import { DEFAULT_SETTINGS } from "@openmesh/shared";

export interface ChunkManagerOptions {
  chunkSize?: number;
}

export class ChunkManager {
  private chunkSize: number;

  constructor(options: ChunkManagerOptions = {}) {
    this.chunkSize = options.chunkSize ?? DEFAULT_SETTINGS.chunkSize;
  }

  getChunkSize(): number {
    return this.chunkSize;
  }

  getTotalChunks(fileSize: number): number {
    return Math.ceil(fileSize / this.chunkSize);
  }

  async *readChunks(file: File): AsyncGenerator<{ index: number; data: ArrayBuffer; offset: number }> {
    let offset = 0;
    let index = 0;

    while (offset < file.size) {
      const end = Math.min(offset + this.chunkSize, file.size);
      const blob = file.slice(offset, end);
      const data = await blob.arrayBuffer();
      yield { index, data, offset };
      offset = end;
      index++;
    }
  }
}
