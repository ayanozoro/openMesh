# OpenMesh Architecture

## Overview

OpenMesh is a monorepo-based, privacy-first file sharing platform built with clean architecture principles. The system separates concerns across apps (deployable services) and packages (shared libraries).

## Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│              apps/web (Next.js + React)                  │
├─────────────────────────────────────────────────────────┤
│                   Application Layer                      │
│         Zustand stores, hooks, page components           │
├─────────────────────────────────────────────────────────┤
│                    Domain Layer                          │
│    packages/shared (types, events, business rules)       │
├─────────────────────────────────────────────────────────┤
│                 Infrastructure Layer                     │
│  packages/networking, encryption, transfer, sdk            │
├─────────────────────────────────────────────────────────┤
│                   Signaling Layer                        │
│           apps/server (Express + Socket.IO)              │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

### File Transfer Pipeline

```
Sender                          Receiver
  │                                │
  ├─ File (ReadableStream)         │
  ├─ ChunkManager                  │
  ├─ Encryption (AES-256-GCM)      │
  ├─ WebRTC DataChannel ──────────►│
  │                                ├─ Integrity Check (SHA-256)
  │                                ├─ Decryption
  │                                ├─ WritableStream
  │                                └─ Disk
```

### Signaling Flow

```
Device A                    Server                    Device B
   │                          │                          │
   ├── device:register ──────►│                          │
   │                          │◄──── device:register ────┤
   ├── room:create ──────────►│                          │
   │                          ├── room:update ──────────►│
   ├── signal:offer ─────────►│                          │
   │                          ├── signal:offer ─────────►│
   │                          │◄─── signal:answer ───────┤
   │◄── signal:answer ────────┤                          │
   ├── signal:ice ───────────►│                          │
   │                          ├── signal:ice ───────────►│
   │◄════════ WebRTC P2P Connection Established ════════►│
```

## Package Responsibilities

| Package | Purpose |
|---------|---------|
| `@openmesh/shared` | Types, constants, socket events, utilities |
| `@openmesh/networking` | WebRTC peer connections, ICE handling |
| `@openmesh/encryption` | AES-256-GCM encrypt/decrypt, SHA-256 hashing |
| `@openmesh/transfer` | Chunk manager, stream-based file transfer |
| `@openmesh/sdk` | Public developer API |

## Database (MongoDB)

Stores metadata only — never file content:

- Device metadata
- Room metadata
- Transfer history
- User settings

## Security Model

- **Transport**: WebRTC encrypted channels
- **Application**: AES-256-GCM per-chunk encryption
- **Integrity**: SHA-256 checksum verification
- **Session**: Temporary room tokens with validation
- **Privacy**: No file data touches the server

## Technology Decisions

| Choice | Rationale |
|--------|-----------|
| pnpm workspaces | Efficient monorepo dependency management |
| Turbo | Parallel builds with caching |
| Socket.IO | Reliable WebSocket with fallbacks |
| WebRTC DataChannel | Direct P2P with browser-native encryption |
| Zustand | Lightweight state management with persistence |
| Streams API | Memory-efficient large file handling |
