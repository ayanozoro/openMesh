import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportPublicKey, wrapKeyWithPublicKey, unwrapKeyWithPrivateKey } from "./keywrap.js";

function str2ab(s: string): ArrayBuffer {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).buffer;
  return Buffer.from(s, "utf8").buffer;
}

describe("keywrap helpers", () => {
  it("wraps and unwraps a symmetric key between two parties", async () => {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();

    const bobPub = await exportPublicKey(bob.publicKey);

    const rawKey = str2ab("0123456789abcdef0123456789abcdef"); // 32 bytes ascii
    const wrapped = await wrapKeyWithPublicKey(rawKey, bobPub);
    const unwrapped = await unwrapKeyWithPrivateKey(wrapped, bob.privateKey);

    const a = new Uint8Array(rawKey);
    const b = new Uint8Array(unwrapped);
    assert.strictEqual(a.length, b.length, "length matches");
    for (let i = 0; i < a.length; i++) assert.strictEqual(a[i], b[i], `byte ${i} matches`);
  }).timeout(10_000);
});
