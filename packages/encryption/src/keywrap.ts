const EC_CURVES = ["X25519", "P-256"];

async function chooseCurve(): Promise<string> {
  for (const c of EC_CURVES) {
    try {
      // try generate a keypair to detect support
      // @ts-ignore
      await crypto.subtle.generateKey({ name: "ECDH", namedCurve: c }, true, ["deriveBits"]);
      return c;
    } catch (_) {
      continue;
    }
  }
  throw new Error("No supported ECDH curve available");
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  const curve = await chooseCurve();
  // @ts-ignore
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: curve }, true, ["deriveBits"]) as Promise<CryptoKeyPair>;
}

export async function exportPublicKey(key: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.exportKey("raw", key);
}

export async function importPublicKey(raw: ArrayBuffer, curve?: string): Promise<CryptoKey> {
  const c = curve ?? (await chooseCurve());
  // @ts-ignore
  return crypto.subtle.importKey("raw", raw, { name: "ECDH", namedCurve: c }, true, []) as Promise<CryptoKey>;
}

async function hkdf(ikm: ArrayBuffer, salt: ArrayBuffer | null, info: string, length = 32): Promise<ArrayBuffer> {
  const baseKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt ?? new Uint8Array(0), info: new TextEncoder().encode(info) }, baseKey, length * 8);
  return derived;
}

export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const raw = await hkdf(bits, null, "openmesh-transfer", 32);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function wrapKeyWithPublicKey(rawKey: ArrayBuffer, recipientPublicRaw: ArrayBuffer): Promise<string> {
  const recipientPub = await importPublicKey(recipientPublicRaw);
  const ephemeral = await generateKeyPair();
  const shared = await deriveSharedKey(ephemeral.privateKey, recipientPub);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, shared, rawKey);

  const epub = await exportPublicKey(ephemeral.publicKey);

  // result: base64(epub) || "." || base64(iv||ciphertext)
  const payload = new Uint8Array(iv.byteLength + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), iv.byteLength);

  function b64(ab: ArrayBuffer) {
    const Buf = (globalThis as any).Buffer;
    if (Buf) return Buf.from(ab).toString("base64");
    return btoa(String.fromCharCode(...new Uint8Array(ab)));
  }

  return `${b64(epub)}.${b64(payload.buffer)}`;
}

export async function unwrapKeyWithPrivateKey(wrapped: string, recipientPrivate: CryptoKey): Promise<ArrayBuffer> {
  const [epubB64, payloadB64] = wrapped.split(".");
  function fromB64(s: string) {
    const Buf = (globalThis as any).Buffer;
    if (Buf) return Buf.from(s, "base64").buffer;
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  const epubRaw = fromB64(epubB64);
  const payload = new Uint8Array(fromB64(payloadB64));
  const iv = payload.slice(0, 12);
  const ciphertext = payload.slice(12).buffer;

  const ephemeralPub = await importPublicKey(epubRaw);
  const shared = await deriveSharedKey(recipientPrivate, ephemeralPub);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, shared, ciphertext as ArrayBuffer);
  return decrypted;
}

export default {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedKey,
  wrapKeyWithPublicKey,
  unwrapKeyWithPrivateKey,
};
