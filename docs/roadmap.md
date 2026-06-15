# OpenMesh Roadmap

## Phase 1 — Foundation ✅

- [x] Monorepo setup (pnpm + Turbo)
- [x] Next.js web app with App Router
- [x] Express signaling server with Socket.IO
- [x] Glassmorphism UI with dark mode
- [x] Shared types and utilities package
- [x] Basic device registration via WebSocket
- [x] Room create/join/leave signaling
- [x] Zustand state management with persistence

## Phase 2 — Discovery & Rooms

- [ ] mDNS/Bonjour device discovery on LAN
- [ ] MongoDB integration for metadata persistence
- [ ] Room UI with member list and invite codes
- [ ] Device status heartbeat and reconnection
- [ ] Transfer queue per room

## Phase 3 — WebRTC & Text

- [ ] WebRTC peer connection establishment
- [ ] ICE candidate exchange via signaling
- [ ] Real-time text messaging in rooms
- [ ] Connection quality indicators

## Phase 4 — File Transfer

- [ ] Stream-based file reading (never load full file in memory)
- [ ] WebRTC DataChannel file streaming
- [ ] Drag & drop with progress tracking
- [ ] Support for all file types including 100GB+

## Phase 5 — Reliability ✅

- [x] Configurable chunk sizes
- [x] Pause / resume transfers
- [x] Cancel and retry failed transfers
- [x] Transfer history persistence
- [x] RESUME protocol for missing chunks
- [x] IndexedDB checkpoint storage
- [x] SHA-256 integrity verification

## Phase 6 — Security & SDK

- [ ] AES-256-GCM chunk encryption
- [ ] SHA-256 integrity verification
- [ ] Session token management
- [ ] Full SDK with browser and Node.js support

## Phase 7 — Release

- [ ] Comprehensive test suite
- [ ] GitHub Actions CI/CD
- [ ] Docker deployment
- [ ] API documentation
- [ ] v1.0.0 release

## Future

- Clipboard sharing
- Folder sync
- Chat and whiteboard
- Screen sharing
- Media streaming
- Plugin system
- Desktop app (Electron/Tauri)
- Mobile app (React Native)
- CLI tool
