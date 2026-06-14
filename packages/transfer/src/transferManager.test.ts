import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TransferManager } from "./transferManager.js";

describe("TransferManager cleanup", () => {
  it("clears pending ACK timers and removes waiters on cleanup", async () => {
    const tm = new TransferManager();
    const transferId = "t_cleanup_test";

    // add a fake reception
    (tm as any).receptions.set(transferId, {
      from: "peer",
      manifest: { totalChunks: 1 },
      chunks: new Map(),
      receivedCount: 0,
      createdAt: Date.now(),
    });

    // create a pending ack with a timer that would set a flag if fired
    let fired = false;
    const timeoutId = setTimeout(() => {
      fired = true;
    }, 200);

    const map = new Map();
    map.set(0, { buffer: new ArrayBuffer(1), retries: 0, timeoutId });
    (tm as any).pendingAcks.set(transferId, map);

    // create a waiter EventTarget
    const et = new EventTarget();
    (tm as any).pendingWaiters.set(transferId, et);

    // call cleanup
    (tm as any).cleanupTransfer(transferId);

    // pendingAcks and waiters should be removed
    assert.equal((tm as any).pendingAcks.has(transferId), false);
    assert.equal((tm as any).pendingWaiters.has(transferId), false);
    assert.equal((tm as any).receptions.has(transferId), false);

    // wait to ensure original timer would have fired if not cleared
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(fired, false, "timer should have been cleared by cleanup");
  });
});
