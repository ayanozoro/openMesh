import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKey, exportKey, importKey, encrypt, decrypt, hash, Sha256Hasher } from "./index.js";

function str2ab(s: string): ArrayBuffer {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).buffer;
  return Buffer.from(s, "utf8").buffer;
}

function ab2hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("encryption package", () => {
  it("generates, exports, imports keys and roundtrip encrypt/decrypt", async () => {
    const key = await generateKey();
    const raw = await exportKey(key);
    assert(raw.byteLength > 0, "exported key should have bytes");

    const imported = await importKey(raw);
    assert(imported, "imported key should exist");

    const data = str2ab("hello openmesh");
    const enc = await encrypt(data, imported);
    assert(enc.byteLength > 0, "encrypted payload should be non-empty");

    const dec = await decrypt(enc, imported);
    assert.strictEqual(ab2hex(dec), ab2hex(data), "decrypted data must equal original");
  });

  it("hash() matches incremental Sha256Hasher and subtle.digest", async () => {
    const input = str2ab("The quick brown fox jumps over the lazy dog");

    const h1 = await hash(input);

    const hasher = new Sha256Hasher();
    hasher.update(input);
    const h2 = hasher.digest();

    assert.strictEqual(h1, h2, "hash() should match Sha256Hasher digest");

    // compare with subtle.digest as additional sanity check
    const subtle = await crypto.subtle.digest("SHA-256", input);
    const subtleHex = Array.from(new Uint8Array(subtle)).map((b) => b.toString(16).padStart(2, "0")).join("");
    assert.strictEqual(h1, subtleHex, "hash should match WebCrypto digest");
  });
});
