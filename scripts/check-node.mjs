#!/usr/bin/env node

const major = Number(process.versions.node.split(".")[0]);

if (major > 22) {
  console.warn(`
⚠️  Node.js ${process.version} detected — OpenMesh targets Node 20.x / 22.x LTS.

pnpm commands will NOT work on Node ${major}.
Use npm scripts instead (they bypass pnpm):

  npm run dev
  npm run dev:server
  npm run dev:web

To fix pnpm permanently, install Node 22 LTS from https://nodejs.org/
`);
}
