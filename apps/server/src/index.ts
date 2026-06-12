import express, { type Express } from "express";
import cors from "cors";
import { createServer } from "node:http";
import { APP_VERSION, createApiResponse, PORTS } from "@openmesh/shared";
import { createSocketServer } from "./socket/index.js";

const app: Express = express();
const httpServer = createServer(app);
const startTime = Date.now();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
  }),
);
app.use(express.json());

createSocketServer(httpServer);

app.get("/", (_req, res) => {
  res.json(
    createApiResponse(true, {
      name: "OpenMesh Server",
      version: APP_VERSION,
      docs: "/api/health",
    }),
  );
});

app.get("/api/health", (_req, res) => {
  res.json(
    createApiResponse(true, {
      status: "ok",
      version: APP_VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    }),
  );
});

const port = Number(process.env.PORT ?? PORTS.SERVER);

httpServer.listen(port, () => {
  console.log(`[openmesh] Server running on http://localhost:${port}`);
  console.log(`[openmesh] WebSocket signaling ready`);
});

export { app, httpServer };
