import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TransferManager } from "./transferManager.js";

class FakeDC {
  partner?: FakeDC;
  onmessage: ((ev: any) => void) | null = null as any;
  readyState = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  constructor(public id: string) {}
  send(data: any) {
    // simulate async delivery
    setTimeout(() => {
      if (this.partner && this.partner.onmessage) {
        const ev = { data };
        try { this.partner.onmessage(ev as any); } catch (e) { /* ignore */ }
      }
    }, 0);
  }
}

class TestFile {
  name: string;
  type: string;
  size: number;
  private buf: Uint8Array;
  constructor(name: string, data: Uint8Array) {
    this.name = name;
    this.type = "application/octet-stream";
    this.buf = data;
    this.size = data.length;
  }
  slice(start: number, end?: number) {
    const s = start || 0;
    const e = typeof end === "number" ? end : this.size;
    const arr = this.buf.slice(s, e);
    return new Blob([arr]);
  }
}

function blobToArrayBuffer(b: Blob): Promise<ArrayBuffer> {
  return b.arrayBuffer();
}

describe("TransferManager E2E encrypted transfer", () => {
  it("sends a small file between two TransferManagers with encryption enabled", async () => {
    const a = new TransferManager();
    const b = new TransferManager();

    const dcA = new FakeDC("a");
    const dcB = new FakeDC("b");
    dcA.partner = dcB; dcB.partner = dcA;

    // wire data channels
    a.attachDataChannel("peer-b", dcA as unknown as RTCDataChannel);
    b.attachDataChannel("peer-a", dcB as unknown as RTCDataChannel);

    let received: any = null;
    b.addEventListener("file-received", (ev: any) => {
      received = ev.detail;
    });

    // prepare a small file
    const data = new Uint8Array([1,2,3,4,5,6,7,8,9,10]);
    const file = new TestFile("numbers.bin", data);

    // send from a to b
    const handle = await a.sendFile(dcA as unknown as RTCDataChannel, (file as unknown) as File, { enableEncryption: true, chunkSize: 4 });

    // wait for reception
    const start = Date.now();
    while (!received && Date.now() - start < 5000) await new Promise((r) => setTimeout(r, 50));

    assert(received, "file should be received");
    // compare checksum if provided
    const recFile = received.file;
    let ab: ArrayBuffer;
    if (recFile instanceof Blob) ab = await recFile.arrayBuffer();
    else if (recFile && typeof recFile.arrayBuffer === "function") ab = await recFile.arrayBuffer();
    else throw new Error("received file not available as blob");

    const arr = new Uint8Array(ab);
    assert.strictEqual(arr.length, data.length);
    for (let i = 0; i < arr.length; i++) assert.strictEqual(arr[i], data[i]);
  }).timeout(10_000);
});
