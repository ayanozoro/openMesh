# Use local pnpm (avoids global pnpm 11.x + Node 23 issues)
$pnpm = Join-Path $PSScriptRoot "..\node_modules\pnpm\bin\pnpm.cjs"
node $pnpm @args
