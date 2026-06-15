# OpenMesh

**Privacy-first, peer-to-peer local file sharing platform.**

Share files, folders, and text across devices on your local network — no cloud storage, no accounts, no limits.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)

## Features

- **Zero Cloud Storage** — Files never leave your local network
- **No Accounts** — Connect instantly without sign-up
- **End-to-End Encrypted** — AES-256-GCM with SHA-256 verification
- **Large File Support** — Stream-based transfers for 100GB+ files
- **Cross-Platform** — Web, with desktop and mobile planned
- **Modern UI** — Glassmorphism-inspired dark mode interface
- **Open Source** — MIT licensed, self-hostable

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Installation

```bash
git clone https://github.com/openmesh/openmesh.git
cd openmesh
pnpm install
pnpm setup
```

### Development

```bash
# Start both web and server
pnpm dev

# Or individually
pnpm dev:web      # http://localhost:3000
pnpm dev:server   # http://localhost:4000
```

## Project Structure

```
openmesh/
├── apps/
│   ├── web/          # Next.js frontend
│   └── server/       # Express + Socket.IO signaling
├── packages/
│   ├── shared/       # Types, constants, utilities
│   ├── sdk/          # Developer SDK
│   ├── networking/   # WebRTC layer
│   ├── encryption/   # AES-256-GCM utilities
│   └── transfer/     # Chunk-based transfer engine
├── docs/             # Documentation
├── docker/           # Docker configuration
└── examples/         # Usage examples
```

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────┐
│   Web App   │◄──────────────────►│   Server    │
│  (Next.js)  │     Signaling      │  (Express)  │
└──────┬──────┘                    └─────────────┘
       │
       │ WebRTC DataChannel (P2P)
       │
┌──────▼──────┐
│  Peer Device│
│   (Browser) │
└─────────────┘
```

The signaling server coordinates device discovery and WebRTC handshake. Actual file data flows directly between peers via encrypted WebRTC DataChannels.

## SDK Usage

```typescript
import { OpenMesh } from "@openmesh/sdk";

const client = new OpenMesh({ serverUrl: "http://localhost:4000" });
await client.connect();
await client.sendFile(file);
client.sendText("Hello!");
```

## Development Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Done | Monorepo, UI, Signaling |
| 2 | 🔜 Next | Device Discovery, Rooms |
| 3 | Planned | WebRTC, Text Transfer |
| 4 | Planned | File Transfer Engine |
| 5 | ✅ Done | Chunking, Resume |
| 6 | Planned | Encryption, SDK |
| 7 | Planned | Docs, Tests, Release |

## Documentation

- [Architecture](docs/architecture.md)
- [Installation Guide](docs/installation.md)
- [SDK Guide](docs/sdk-guide.md)
- [Contributing](docs/contributing.md)
- [Roadmap](docs/roadmap.md)

## License

[MIT](LICENSE) — Built with ❤️ by the OpenMesh community.
