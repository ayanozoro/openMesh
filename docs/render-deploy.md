# Deploying `openmesh` server to Render

This repository now contains a Render manifest and helper script to deploy the server portion of OpenMesh.

Files added:

- [render.yaml](render.yaml) — Render manifest for the `openmesh-server` service.
- [scripts/render-build.sh](scripts/render-build.sh) — build wrapper used by Render.

Quick overview

1. Commit and push these files to your repo (main branch).

```bash
git checkout -b add/render-config
git add render.yaml scripts/render-build.sh docs/render-deploy.md
git commit -m "Add Render manifest and build script for server"
git push origin add/render-config
# open a PR and merge to main, or push directly to main
```

2. Connect repository to Render

- Sign in to Render and connect your Git provider (GitHub/GitLab/Bitbucket).
- Import the repository. If Render detects `render.yaml`, it will create the service automatically. If not, create a new Web Service and use the values below.

Service settings (manual entry)

- **Name**: `openmesh-server`
- **Branch**: `main`
- **Environment**: Node
- **Plan**: Starter (or choose appropriate plan)
- **Build Command**: `bash ./scripts/render-build.sh`
- **Start Command**: `npm run start --workspace=@openmesh/server`
- **Health check path**: `/api/health`
- **Auto deploy**: Enabled

Environment variables (set these in the Render dashboard; do not commit secrets)

- `MONGODB_URI` — (optional) your MongoDB connection string. Leave empty to use in-memory fallback.
- `CORS_ORIGIN` — set to your web app domain, e.g. `https://your-web-domain` (defaults to `*`).
- `NODE_ENV` — `production`

Troubleshooting

- If the build fails with `Cannot find module '@openmesh/shared'`, ensure the Build Command runs at the repository root and that devDependencies are installed during build. The provided build script runs `npm ci` then the repo-level build.
- If Render's build environment skips devDependencies, change the Build Command to:

```
npm ci --include=dev && npm run build
```

Docker option

- You can also deploy as a Docker service using `docker/Dockerfile.server` and selecting "Docker" when creating the Render service.

After deploy

- Open the service's URL and check `/api/health`.
- Update the web app's `NEXT_PUBLIC_SERVER_URL` to the deployed server URL and redeploy the web frontend (on Vercel or similar).

If you want, I can prepare a pull request with these files added. I cannot push or create the Render service from here without delegated credentials or an API key.
