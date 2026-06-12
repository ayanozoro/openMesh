#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function runWorkspace(name) {
  return spawn(npm, ["run", "dev", `--workspace=${name}`], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
}

console.log("Starting OpenMesh dev servers (npm workspaces, no pnpm)...\n");

const server = runWorkspace("@openmesh/server");
const web = runWorkspace("@openmesh/web");

const children = [server, web];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const child of children) {
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      shutdown(code);
    }
  });
}
