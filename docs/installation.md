# Installation Guide

## System Requirements

- **Node.js** 20.x or 22.x LTS (recommended: **22 LTS**)
- **pnpm** 9.x via Corepack (project pins `pnpm@9.15.0`)
- **MongoDB** 7.0+ (optional, for Phase 2+)

> **Important:** Do not use Node.js 23+ with a globally installed pnpm 11.x. That combination fails with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. Use Node 22 LTS and the project's pinned pnpm instead.

## Local Development

```bash
# Clone the repository
git clone https://github.com/openmesh/openmesh.git
cd openmesh

# Install dependencies (pick one)
npm install          # recommended on Windows without pnpm in PATH
# OR
node node_modules/pnpm/bin/pnpm.cjs install   # if node_modules already exists

# Run setup (builds all packages)
npm run setup

# Start development servers
npm run dev
```

### Windows (no nvm, no admin)

If `pnpm` fails with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`, your global pnpm 11.x is incompatible with Node 23. **You do not need nvm or Corepack admin access.** Use npm scripts instead — they call the local tools in `node_modules`:

```powershell
cd d:\project\localShare\openmesh
npm install
npm run dev          # starts web + server
npm run dev:server   # server only (port 4000)
npm run dev:web      # web only (port 3000)
```

Or call local pnpm directly:

```powershell
node node_modules/pnpm/bin/pnpm.cjs install
node node_modules/pnpm/bin/pnpm.cjs dev
```

To fix Node 23 permanently, install **Node 22 LTS** from [nodejs.org](https://nodejs.org/) (replaces the system install — no nvm required).

The web app runs at `http://localhost:3000` and the signaling server at `http://localhost:4000`.

## Environment Variables

### Server (`apps/server/.env`)

```env
PORT=4000
CORS_ORIGIN=http://localhost:3000
NODE_ENV=development
# MONGODB_URI=mongodb://localhost:27017/openmesh
```

Copy from the example:

```bash
cp apps/server/.env.example apps/server/.env
```

## Docker (Coming Soon)

```bash
docker compose up -d
```

## Production Build

```bash
pnpm build
pnpm --filter @openmesh/server start
pnpm --filter @openmesh/web start
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` | **Node 23 + pnpm 11** — pnpm uses a SQLite module that Node 23 doesn't provide. Do **not** use `pnpm` commands. Use `npm run dev` instead (see below) |
| `corepack enable` EPERM error | Needs admin to write to `Program Files\nodejs`. Skip Corepack — use `npm run` scripts |
| `nvm` not recognized | nvm is not installed. Install Node 22 LTS from [nodejs.org](https://nodejs.org/) instead |
| Port already in use | Change `PORT` in server `.env` or use `--port` flag for Next.js |
| WebSocket connection failed | Ensure server is running and `CORS_ORIGIN` matches web URL |
| pnpm not found | Run `corepack enable` or use `./node_modules/.bin/pnpm` after `npm install` in the repo root |
