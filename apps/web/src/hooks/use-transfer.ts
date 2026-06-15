"use client";

import { useCallback, useEffect } from "react";
import type { TransferHandle } from "@openmesh/sdk";
import type { TransferHistoryEntry, TransferItem } from "@openmesh/shared";
import { generateId } from "@openmesh/shared";
import { useAppStore } from "@/stores/app-store";
import { getOpenMeshClient } from "@/hooks/use-openmesh";

const fileCache = new Map<string, File>();
const handlesRef = { current: new Map<string, TransferHandle>() };
let eventsBound = false;

function buildHistoryEntry(
  transfer: TransferItem,
  status: "completed" | "failed",
  devices: ReturnType<typeof useAppStore.getState>["devices"],
  rooms: ReturnType<typeof useAppStore.getState>["rooms"],
  checksum?: string,
): TransferHistoryEntry {
  const peer = transfer.peerId ? devices.find((d) => d.id === transfer.peerId) : undefined;
  const room = transfer.roomId ? rooms.find((r) => r.id === transfer.roomId) : undefined;
  return {
    ...transfer,
    status: status === "completed" ? "completed" : "failed",
    completedAt: new Date().toISOString(),
    checksum: checksum ?? transfer.checksum,
    deviceName: transfer.deviceName ?? peer?.name ?? "Unknown device",
    roomName: room?.name,
  };
}

export function useTransferBridge(): void {
  const {
    devices,
    settings,
    addTransfer,
    updateTransfer,
    addHistoryEntry,
  } = useAppStore();

  useEffect(() => {
    if (eventsBound) return;

    const client = getOpenMeshClient();
    if (!client) return;

    eventsBound = true;

    client.updateSettings({
      chunkSize: settings.chunkSize,
      enableEncryption: settings.enableEncryption,
      deviceName: settings.deviceName,
      serverUrl: settings.serverUrl,
    });

    const tm = client.getTransferManager();

    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        transferId: string;
        offset?: number;
        total?: number;
        receivedCount?: number;
      };

      const { transferId } = detail;
      let progress = 0;
      let bytesTransferred = 0;

      if (detail.offset !== undefined && detail.total) {
        bytesTransferred = detail.offset;
        progress = (detail.offset / detail.total) * 100;
      } else if (detail.receivedCount !== undefined && detail.total) {
        progress = (detail.receivedCount / detail.total) * 100;
        bytesTransferred = progress;
      }

      updateTransfer(transferId, {
        status: "transferring",
        progress,
        bytesTransferred,
      });
    };

    const onComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail as { transferId: string; fileHash?: string };
      const state = useAppStore.getState();
      const transfer = state.transfers.find((t) => t.id === detail.transferId);
      updateTransfer(detail.transferId, {
        status: "completed",
        progress: 100,
        completedAt: new Date().toISOString(),
        checksum: detail.fileHash,
      });
      if (transfer) {
        addHistoryEntry(
          buildHistoryEntry(transfer, "completed", state.devices, state.rooms, detail.fileHash),
        );
      }
      handlesRef.current.delete(detail.transferId);
      fileCache.delete(detail.transferId);
    };

    const onTransferStart = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        from: string;
        transferId: string;
        manifest: { fileName: string; fileSize: number; mimeType?: string };
      };

      const peer = devices.find((d) => d.id === detail.from);
      const transfer: TransferItem = {
        id: detail.transferId,
        fileName: detail.manifest.fileName,
        fileSize: detail.manifest.fileSize,
        mimeType: detail.manifest.mimeType || "application/octet-stream",
        status: "transferring",
        direction: "receive",
        progress: 0,
        bytesTransferred: 0,
        speed: 0,
        startedAt: new Date().toISOString(),
        peerId: detail.from,
        deviceName: peer?.name,
      };
      addTransfer(transfer);
    };

    const onFileReceived = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        transferId: string;
        checksum?: string;
      };

      const state = useAppStore.getState();
      const transfer = state.transfers.find((t) => t.id === detail.transferId);
      updateTransfer(detail.transferId, {
        status: "completed",
        progress: 100,
        completedAt: new Date().toISOString(),
        checksum: detail.checksum,
      });
      if (transfer) {
        addHistoryEntry(
          buildHistoryEntry(transfer, "completed", state.devices, state.rooms, detail.checksum),
        );
      }
    };

    const onError = (e: Event) => {
      const detail = (e as CustomEvent).detail as { transferId?: string; error?: unknown };
      if (!detail.transferId) return;
      const state = useAppStore.getState();
      const transfer = state.transfers.find((t) => t.id === detail.transferId);
      updateTransfer(detail.transferId, {
        status: "failed",
        error: String(detail.error ?? "Transfer failed"),
      });
      if (transfer) {
        addHistoryEntry(buildHistoryEntry(transfer, "failed", state.devices, state.rooms));
      }
      handlesRef.current.delete(detail.transferId);
    };

    const onCancelled = (e: Event) => {
      const detail = (e as CustomEvent).detail as { transferId: string };
      updateTransfer(detail.transferId, { status: "cancelled" });
      handlesRef.current.delete(detail.transferId);
      fileCache.delete(detail.transferId);
    };

    const onPaused = (e: Event) => {
      const detail = (e as CustomEvent).detail as { transferId: string };
      updateTransfer(detail.transferId, { status: "paused" });
    };

    const onResumed = (e: Event) => {
      const detail = (e as CustomEvent).detail as { transferId: string };
      updateTransfer(detail.transferId, { status: "transferring" });
    };

    const events: [string, EventListener][] = [
      ["progress", onProgress as EventListener],
      ["complete", onComplete as EventListener],
      ["transfer-start", onTransferStart as EventListener],
      ["file-received", onFileReceived as EventListener],
      ["error", onError as EventListener],
      ["transfer-error", onError as EventListener],
      ["cancelled", onCancelled as EventListener],
      ["transfer-paused", onPaused as EventListener],
      ["transfer-resumed", onResumed as EventListener],
    ];

    for (const [name, handler] of events) {
      tm.addEventListener(name, handler);
    }

    return () => {
      eventsBound = false;
      for (const [name, handler] of events) {
        tm.removeEventListener(name, handler);
      }
    };
  }, [
    settings.chunkSize,
    settings.enableEncryption,
    settings.deviceName,
    settings.serverUrl,
    devices,
    addTransfer,
    updateTransfer,
    addHistoryEntry,
  ]);
}

export function useTransfer() {
  const {
    deviceId,
    devices,
    settings,
    activeRoomId,
    rooms,
    addTransfer,
    updateTransfer,
    removeTransfer,
    selectedPeerId,
    setSelectedPeerId,
  } = useAppStore();

  const resolvePeerId = useCallback(
    (peerId?: string, roomId?: string): string | null => {
      if (peerId) return peerId;
      if (selectedPeerId) return selectedPeerId;

      if (roomId) {
        const room = rooms.find((r) => r.id === roomId);
        const other = room?.members.find((m) => m.deviceId !== deviceId);
        if (other) return other.deviceId;
      }

      const online = devices.filter((d) => d.id !== deviceId && d.status === "online");
      return online[0]?.id ?? null;
    },
    [selectedPeerId, rooms, devices, deviceId],
  );

  const sendFiles = useCallback(
    async (files: FileList | File[], options?: { peerId?: string; roomId?: string }) => {
      const client = getOpenMeshClient();
      if (!client) throw new Error("OpenMesh client not ready");

      const targetPeer = resolvePeerId(options?.peerId, options?.roomId ?? activeRoomId ?? undefined);
      if (!targetPeer) throw new Error("No peer available. Select a device or join a room with members.");

      const roomId = options?.roomId ?? activeRoomId ?? undefined;
      const peer = devices.find((d) => d.id === targetPeer);

      for (const file of Array.from(files)) {
        const uiId = generateId("xfer");
        const transfer: TransferItem = {
          id: uiId,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          status: "queued",
          direction: "send",
          progress: 0,
          bytesTransferred: 0,
          speed: 0,
          startedAt: new Date().toISOString(),
          roomId: roomId ?? undefined,
          peerId: targetPeer,
          deviceName: peer?.name,
        };
        addTransfer(transfer);

        try {
          updateTransfer(uiId, { status: "transferring" });
          const handle = await client.sendFile(file, targetPeer, {
            roomId: roomId ?? undefined,
            chunkSize: settings.chunkSize,
            enableEncryption: settings.enableEncryption,
          });

          fileCache.set(handle.transferId, file);
          client.cacheFileForTransfer(handle.transferId, file);
          handlesRef.current.set(handle.transferId, handle);

          const state = useAppStore.getState();
          const current = state.transfers.find((t) => t.id === uiId);
          if (current) {
            removeTransfer(uiId);
            addTransfer({ ...current, id: handle.transferId });
          }
        } catch (err) {
          updateTransfer(uiId, {
            status: "failed",
            error: err instanceof Error ? err.message : "Send failed",
          });
        }
      }
    },
    [
      activeRoomId,
      addTransfer,
      devices,
      removeTransfer,
      resolvePeerId,
      settings.chunkSize,
      settings.enableEncryption,
      updateTransfer,
    ],
  );

  const pauseTransfer = useCallback((transferId: string) => {
    const handle = handlesRef.current.get(transferId) ?? getOpenMeshClient()?.getTransferHandle(transferId);
    handle?.pause();
  }, []);

  const resumeTransfer = useCallback((transferId: string) => {
    const handle = handlesRef.current.get(transferId) ?? getOpenMeshClient()?.getTransferHandle(transferId);
    handle?.resume();
  }, []);

  const cancelTransfer = useCallback(
    (transferId: string) => {
      const handle = handlesRef.current.get(transferId) ?? getOpenMeshClient()?.getTransferHandle(transferId);
      handle?.cancel("user_cancelled");
      removeTransfer(transferId);
      fileCache.delete(transferId);
      handlesRef.current.delete(transferId);
    },
    [removeTransfer],
  );

  const retryTransfer = useCallback(
    async (transferId: string) => {
      const client = getOpenMeshClient();
      const transfer = useAppStore.getState().transfers.find((t) => t.id === transferId);
      if (!client || !transfer?.peerId) return;

      const file = fileCache.get(transferId);
      if (!file) {
        updateTransfer(transferId, { status: "failed", error: "Re-select the file to retry" });
        return;
      }

      try {
        updateTransfer(transferId, { status: "transferring", progress: 0, error: undefined });
        const handle = await client.retryFile(transferId, transfer.peerId, file, {
          roomId: transfer.roomId,
          chunkSize: settings.chunkSize,
          enableEncryption: settings.enableEncryption,
        });
        handlesRef.current.set(handle.transferId, handle);
      } catch (err) {
        updateTransfer(transferId, {
          status: "failed",
          error: err instanceof Error ? err.message : "Retry failed",
        });
      }
    },
    [settings.chunkSize, settings.enableEncryption, updateTransfer],
  );

  return {
    sendFiles,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    retryTransfer,
    selectedPeerId,
    setSelectedPeerId,
    cacheFile: (transferId: string, file: File) => fileCache.set(transferId, file),
  };
}
