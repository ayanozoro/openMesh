#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const turbo = "node node_modules/turbo/bin/turbo run build";

console.log("Setting up OpenMesh monorepo...\n");

if (!existsSync(resolve(root, "node_modules"))) {
  console.log("Installing dependencies...");
  execSync("npm install", { cwd: root, stdio: "inherit" });
}

console.log("Building packages...");
execSync(turbo, { cwd: root, stdio: "inherit", shell: true });

console.log("\nSetup complete!");
console.log("\nNext steps:");
console.log("  npm run dev          — Start web + server");
console.log("  npm run dev:web      — Start web only (http://localhost:3000)");
console.log("  npm run dev:server   — Start server only (http://localhost:4000)");
