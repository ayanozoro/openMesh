"use client";

import { useEffect, useRef } from "react";
import { OpenMesh } from "@openmesh/sdk";
import { useAppStore } from "@/stores/app-store";

let client: OpenMesh | null = null;

export function useOpenMesh(): OpenMesh | null {
  const sdkRef = useRef<OpenMesh | null>(null);
  const { addMessage, deviceId, settings } = useAppStore();

  useEffect(() => {
    if (sdkRef.current) return;

    client = new OpenMesh({
      deviceId,
      deviceName: settings.deviceName,
      serverUrl: settings.serverUrl,
    });
    sdkRef.current = client;

    client.updateSettings(settings);

    client
      .connect()
      .then(() => {
        client?.onDataMessage((_from, payload) => {
          if (payload && typeof payload === "object" && "roomId" in payload) {
            addMessage((payload as { roomId: string }).roomId, payload as Parameters<typeof addMessage>[1]);
          }
        });
      })
      .catch(() => {
        // ignore for now
      });

    return () => {
      if (sdkRef.current) sdkRef.current.disconnect();
      sdkRef.current = null;
      client = null;
    };
  }, [addMessage, deviceId, settings.deviceName, settings.serverUrl]);

  return sdkRef.current;
}

export function getOpenMeshClient(): OpenMesh | null {
  return client;
}
