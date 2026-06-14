"use client";

import { useEffect, useRef } from "react";
import { OpenMesh } from "@openmesh/sdk";
import { useAppStore } from "@/stores/app-store";

let client: OpenMesh | null = null;

export function useOpenMesh(): OpenMesh | null {
  const sdkRef = useRef<OpenMesh | null>(null);
  const { addMessage } = useAppStore();

  useEffect(() => {
    if (sdkRef.current) return;

    client = new OpenMesh({});
    sdkRef.current = client;

    client.connect().then(() => {
      client.onDataMessage((from, payload) => {
        if (payload && payload.roomId) {
          addMessage(payload.roomId, payload);
        }
      });
    }).catch(() => {
      // ignore for now
    });

    return () => {
      if (sdkRef.current) sdkRef.current.disconnect();
      sdkRef.current = null;
    };
  }, [addMessage]);

  return sdkRef.current;
}

export function getOpenMeshClient(): OpenMesh | null {
  return client;
}
