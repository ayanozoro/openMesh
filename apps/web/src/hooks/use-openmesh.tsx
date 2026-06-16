"use client";

import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/app-store";

let client: any = null;
let clientReadyResolve: ((c: any) => void) | null = null;
let clientReadyPromise: Promise<any> | null = null;

export function useOpenMesh(): any {
  const sdkRef = useRef<any>(null);
  const { addMessage, deviceId, settings } = useAppStore();

  useEffect(() => {
    if (sdkRef.current) return;

    (async () => {
      try {
        const mod = await import("@openmesh/sdk");
        const OpenMesh = mod.OpenMesh ?? mod.default ?? mod;

        client = new OpenMesh({
          deviceId,
          deviceName: settings.deviceName,
          serverUrl: settings.serverUrl,
        });
        sdkRef.current = client;

        // resolve any waiters
        if (clientReadyResolve) clientReadyResolve(client);
        clientReadyResolve = null;

        client.updateSettings(settings);

        client
          .connect()
          .then(() => {
            client?.onDataMessage((_from: any, payload: any) => {
              if (payload && typeof payload === "object" && "roomId" in payload) {
                addMessage((payload as { roomId: string }).roomId, payload as Parameters<typeof addMessage>[1]);
              }
            });
          })
          .catch(() => {
            // ignore for now
          });
      } catch (err) {
        // dynamic import failed — ignore on server
      }
    })();

    return () => {
      if (sdkRef.current) sdkRef.current.disconnect();
      sdkRef.current = null;
      client = null;
    };
  }, [addMessage, deviceId, settings.deviceName, settings.serverUrl]);

  return sdkRef.current;
}

export function getOpenMeshClient(): any | null {
  return client;
}

export function waitForOpenMeshClient(timeoutMs = 5000): Promise<any> {
  if (client) return Promise.resolve(client);

  const start = Date.now();
  const maxWait = timeoutMs;
  const baseDelay = Number(process.env.NEXT_PUBLIC_CLIENT_WAIT_BASE_MS ?? 500);
  const maxDelay = Number(process.env.NEXT_PUBLIC_CLIENT_WAIT_MAX_MS ?? 2000);

  return new Promise((resolve, reject) => {
    let delay = baseDelay;

    const tryOnce = () => {
      if (client) return resolve(client);
      if (Date.now() - start > maxWait) return reject(new Error("OpenMesh client ready timeout"));

      const schedule = (fn: () => void, ms: number) => {
        if (typeof window !== "undefined" && (window as any).requestIdleCallback) {
          try {
            (window as any).requestIdleCallback(() => fn(), { timeout: ms });
            return;
          } catch {
            // fallthrough to setTimeout
          }
        }
        setTimeout(fn, ms);
      };

      schedule(() => {
        if (client) return resolve(client);
        // exponential backoff for next try
        delay = Math.min(delay * 2, maxDelay);
        tryOnce();
      }, delay);
    };

    tryOnce();
  });
}
