# Encryption Specification & Key Management

This document describes the encryption primitives, message formats, key management, and security considerations used by OpenMesh.

Goals
- End-to-end confidentiality for file transfers between peers on the local network.
- Integrity verification via SHA-256 checksums.
- Minimal trust in signaling server; keys should be ephemeral and not persisted by the server.

Primitives
- Symmetric cipher: AES-256-GCM (WebCrypto `AES-GCM`).
- Authenticated tag: built into AES-GCM output via WebCrypto.
- Hashing: SHA-256 (incremental `Sha256Hasher` for streaming).

Key formats
- Raw symmetric key: 32 bytes (256 bits), exported/imported using WebCrypto `raw` format.
- Encoded transport format: Base64 of raw bytes (field `encryptionKeyB64`).

Per-transfer key usage
- Each transfer MUST use an ephemeral symmetric key (generate via `crypto.subtle.generateKey`).
- For each encrypted chunk the implementation MUST use a unique random IV (recommended 12 bytes). The current implementation prefixes the IV to the ciphertext for each chunk.
- Never reuse an IV for the same key. Do not deterministically derive IVs from chunk index without including a per-transfer random nonce.

Message formats
- META (transfer manifest) JSON example:

```json
{
  "t": "META",
  "p": {
    "transferId": "t_xxx",
    "fileName": "photo.jpg",
    "fileSize": 1234567,
    "mimeType": "image/jpeg",
    "chunkSize": 65536,
    "totalChunks": 19,
    "key": "<base64-raw-32-bytes>"
  }
}
```

- CHUNK: a small JSON header message is sent with chunk metadata (`length`, `index`) followed by the binary payload. If encrypted, the binary payload is structured as: `IV || ciphertext` where IV is 12 bytes (or implementation-chosen length).

Storage & resume
- To support resumable transfers the implementation currently persists `encryptionKeyB64` in the transfer sender state. This is necessary so that resumed sends can re-encrypt chunks with the same key or allow the receiver to continue decrypting previously persisted chunks.
- Persisted keys SHOULD be protected by the host (e.g., store in file system restricted to the current user). Consider encrypting persisted keys with an OS-level key or using a secure enclave for production desktop clients.

Key exchange
- Current behavior: the sender includes the Base64 raw symmetric key in the transfer META which is delivered to the recipient over the already-established WebRTC DataChannel. Because DataChannels are protected by DTLS/SRTP, this provides confidentiality from network eavesdroppers under the assumption that the signaling server cannot read DataChannel payloads.
- Threat model note: if the signaling server or a network attacker is a concern, do NOT send raw symmetric keys via any channel that the server can access. Instead:
  - Use public-key encryption: the recipient publishes a long-term public key (e.g., X25519/ECDH + HKDF or RSA-OAEP) and the sender wraps the symmetric key with the recipient's public key.
  - Or perform an ephemeral ECDH between peers (e.g., use WebCrypto ECDH on a short-lived keypair) and derive a symmetric key per transfer with HKDF.

  Key wrapping integration
  - OpenMesh provides helpers to wrap a per-transfer symmetric key using the recipient's public key. The transfer manifest `key` field may contain either:
    - a Base64 raw symmetric key (legacy behavior), or
    - a wrapped key produced by the sender using the recipient's public key (format: base64(ephemeralPub) + '.' + base64(iv||ciphertext)).

  Usage: when initiating a transfer via the SDK, pass `recipientPublicKeyB64` in `SendFileOptions`. The transfer manager will attempt to wrap the generated AES key with that public key and include the wrapped string in the manifest. The receiver can unwrap using its private key with the `unwrapKeyWithPrivateKey()` helper.

Recommended key-exchange flow (secure against malicious server):
1. Each client generates a long-term Curve25519 (X25519) keypair and uploads the public key to the signaling server (public-only).
2. Sender obtains recipient's public key from server and performs ECDH to derive a shared secret.
3. Derive AES-256-GCM key via HKDF(sharedSecret, info="openmesh-transfer", length=32).
4. Use derived key for per-transfer encryption; do NOT send raw symmetric key over the wire.

Persistence & rotation
- Keys are ephemeral per-transfer; rotation is achieved by generating a new per-transfer key for every new transfer.
- Long-term keypairs for asymmetric wrapping should support rotation: publish new public key and mark prior keys with an expiry timestamp.

Security considerations
- Use WebCrypto where available; fallback implementations must match WebCrypto semantics precisely.
- Validate SHA-256 checksums after assembling a transfer. A mismatch should trigger `HASH_MISMATCH` and abort the transfer.
- Protect persisted keys at rest and minimize their lifetime. Remove persisted keys as soon as a transfer completes (success or failure).
- Avoid sending raw symmetric keys through any server-side channels unless they are end-to-end encrypted for the recipient.
- Consider forward secrecy: prefer ephemeral ECDH (per-transfer) or per-session key exchange to limit exposure if long-term keys are compromised.

Implementation notes for OpenMesh codebase
- `packages/encryption` exports `generateKey()`, `exportKey()`, `importKey()`, `encrypt()`, `decrypt()`, and `hash()`.
- Current `transferManager` embeds `encryptionKeyB64` in the manifest and persists it for resume. This is acceptable for local networks but should be replaced with wrapped keys or ECDH derivation when stronger server-threat models are required.
- Chunk encryption uses a per-chunk random IV and prefixes IV to the encrypted blob. The receiver must parse the IV from the first 12 bytes of each binary chunk before calling `decrypt()`.

Testing
- Unit tests should include:
  - Roundtrip AES-GCM encrypt/decrypt for sample buffers and chunk-sized payloads.
  - SHA-256 incremental hasher tests with known vectors (e.g., RFC 6234 test vectors).
  - Resume tests where persisted chunks are stored and decryption still succeeds after reloading state.

Next steps and hardening options
- Implement optional public-key wrapping in `packages/encryption` (e.g., `wrapKeyWithPublicKey()` and `unwrapKeyWithPrivateKey()` helpers).
- Add automated tests that simulate a compromised server to validate key-exchange protections.
- Document recommended server behaviors: never log or persist transfer keys, rotate any stored client public keys, and provide an authenticated method for peers to fetch public keys.

References
- WebCrypto AES-GCM: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt
- HKDF: RFC 5869
- X25519 and Curve25519 primitives for ECDH

