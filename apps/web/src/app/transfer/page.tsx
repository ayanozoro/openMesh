"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  File,
  X,
  Pause,
  Play,
  RotateCcw,
  FolderOpen,
  Monitor,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { useTransfer } from "@/hooks/use-transfer";
import { formatBytes } from "@openmesh/shared";

export default function TransferPage() {
  const { transfers, devices, deviceId, serverStatus } = useAppStore();
  const {
    sendFiles,
    pauseTransfer,
    resumeTransfer,
    cancelTransfer,
    retryTransfer,
    selectedPeerId,
    setSelectedPeerId,
  } = useTransfer();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otherDevices = devices.filter((d) => d.id !== deviceId && d.status === "online");

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      try {
        await sendFiles(files, { peerId: selectedPeerId ?? undefined });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to start transfer");
      }
    },
    [sendFiles, selectedPeerId],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        void handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const statusVariant: Record<string, "default" | "success" | "warning" | "destructive" | "outline"> = {
    pending: "outline",
    queued: "outline",
    transferring: "default",
    paused: "warning",
    completed: "success",
    failed: "destructive",
    cancelled: "outline",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Transfer</h1>
        <p className="text-muted-foreground">
          Drag and drop files to share with connected devices
        </p>
      </div>

      {serverStatus !== "connected" && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 text-sm text-muted-foreground">
            Connect to the signaling server before transferring files.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4" />
            Target Device
          </CardTitle>
          <CardDescription>Select a peer for direct file transfers</CardDescription>
        </CardHeader>
        <CardContent>
          {otherDevices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No online devices found on the network.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {otherDevices.map((device) => (
                <Button
                  key={device.id}
                  size="sm"
                  variant={selectedPeerId === device.id ? "default" : "secondary"}
                  onClick={() => setSelectedPeerId(device.id)}
                >
                  {device.name}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <motion.div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        animate={{ scale: isDragging ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 300 }}
      >
        <Card
          glow={isDragging}
          className={`border-2 border-dashed transition-colors ${
            isDragging ? "border-primary bg-primary/5" : "border-glass-border"
          }`}
        >
          <CardContent className="flex flex-col items-center justify-center py-16">
            <motion.div
              animate={{ y: isDragging ? -5 : 0 }}
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
            >
              <Upload className="h-8 w-8 text-primary" />
            </motion.div>
            <p className="text-lg font-medium">
              {isDragging ? "Drop files here" : "Drag & drop files here"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Chunked P2P transfers with pause, resume, and retry support
            </p>
            <label className="mt-4 cursor-pointer">
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && void handleFiles(e.target.files)}
              />
              <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium glass hover:bg-white/10 text-foreground h-12 rounded-xl px-6">
                Browse Files
              </span>
            </label>
          </CardContent>
        </Card>
      </motion.div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Transfer Queue
          </CardTitle>
          <CardDescription>
            {transfers.length === 0
              ? "No active transfers"
              : `${transfers.length} item(s) in queue`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="popLayout">
            {transfers.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Add files to start transferring
              </p>
            ) : (
              <div className="space-y-3">
                {transfers.map((transfer) => (
                  <motion.div
                    key={transfer.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-lg border border-glass-border bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <File className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{transfer.fileName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatBytes(transfer.fileSize)}
                            {transfer.deviceName ? ` · ${transfer.deviceName}` : ""}
                          </p>
                          {transfer.error && (
                            <p className="text-xs text-destructive mt-0.5">{transfer.error}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant[transfer.status]}>
                          {transfer.status}
                        </Badge>
                        {transfer.status === "paused" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => resumeTransfer(transfer.id)}
                            aria-label="Resume transfer"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {transfer.status === "transferring" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => pauseTransfer(transfer.id)}
                            aria-label="Pause transfer"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {transfer.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => void retryTransfer(transfer.id)}
                            aria-label="Retry transfer"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        {!["completed", "cancelled"].includes(transfer.status) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => cancelTransfer(transfer.id)}
                            aria-label="Cancel transfer"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {transfer.progress > 0 && (
                      <div className="mt-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                          <motion.div
                            className="h-full rounded-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${transfer.progress}%` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {transfer.progress.toFixed(1)}% complete
                          {transfer.checksum ? ` · verified` : ""}
                        </p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
