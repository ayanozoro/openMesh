# Run from repository root. This installs with npm, generates package-lock.json, and commits it.
if (-not (Test-Path -Path "$PSScriptRoot\..\package.json")) {
  Write-Error "Run this script from the repository `scripts` folder or from the repo root using: .\\scripts\\switch-to-npm.ps1"
  exit 1
}

Write-Host "Removing pnpm artifacts and node_modules..."
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force pnpm-lock.yaml -ErrorAction SilentlyContinue

Write-Host "Installing with npm and generating package-lock.json..."
npm install

if ($LASTEXITCODE -ne 0) {
  Write-Error "npm install failed"
  exit $LASTEXITCODE
}

Write-Host "Running build to verify..."
npm run build

if ($LASTEXITCODE -ne 0) {
  Write-Error "Build failed"
  exit $LASTEXITCODE
}

Write-Host "Committing package-lock.json and package.json changes..."
git add package-lock.json package.json
git commit -m "chore: switch CI to npm and add package-lock.json"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Nothing to commit"
}

Write-Host "Done. Please push the branch: git push"
