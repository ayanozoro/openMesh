import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatBytes, formatSpeed, clamp, generateId } from "../utils/index.js";

describe("formatBytes", () => {
  it("formats zero bytes", () => {
    assert.equal(formatBytes(0), "0 B");
  });

  it("formats kilobytes", () => {
    assert.equal(formatBytes(1024), "1 KB");
  });

  it("formats megabytes", () => {
    assert.equal(formatBytes(1048576), "1 MB");
  });
});

describe("formatSpeed", () => {
  it("appends per-second suffix", () => {
    assert.equal(formatSpeed(1024), "1 KB/s");
  });
});

describe("clamp", () => {
  it("clamps values within range", () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(15, 0, 10), 10);
  });
});

describe("generateId", () => {
  it("generates unique ids", () => {
    const id1 = generateId("dev");
    const id2 = generateId("dev");
    assert.notEqual(id1, id2);
    assert.match(id1, /^dev_/);
  });
});
