#!/usr/bin/env bash
set -euo pipefail
echo "Installing dependencies and building monorepo..."
npm ci
echo "Running repo build (turbo)"
if npm run build; then
  echo "Repo build succeeded."
else
  echo "Repo-level build failed; building shared and server workspaces individually..."
  npm run build --workspace=@openmesh/shared
  npm run build --workspace=@openmesh/server
fi
echo "Build finished."
