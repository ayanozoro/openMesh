import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getMissingIndexes } from "./stateStore.js";
import { buildResumeRequest, shouldRequestResume } from "./resume.js";

describe("resume helpers", () => {
  it("computes missing chunk indexes", () => {
    const missing = getMissingIndexes(5, new Set([0, 2, 4]));
    assert.deepEqual(missing, [1, 3]);
  });

  it("builds resume request from received set", () => {
    const req = buildResumeRequest("t_abc", { totalChunks: 3 } as any, new Set([0]));
    assert.equal(req.transferId, "t_abc");
    assert.deepEqual(req.missingIndexes, [1, 2]);
  });

  it("detects when resume is needed after complete", () => {
    assert.equal(
      shouldRequestResume({ totalChunks: 3 } as any, new Set([0, 1]), true),
      true,
    );
    assert.equal(
      shouldRequestResume({ totalChunks: 3 } as any, new Set([0, 1, 2]), true),
      false,
    );
  });
});
