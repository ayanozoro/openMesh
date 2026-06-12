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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppStore } from "@/stores/app-store";
import { formatBytes, generateId } from "@openmesh/shared";
import type { TransferItem } from "@openmesh/shared";

export default function TransferPage() {
  const { transfers, addTransfer, updateTransfer, removeTransfer } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((file) => {
        const transfer: TransferItem = {
          id: generateId("xfer"),
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
          status: "pending",
          direction: "send",
          progress: 0,
          bytesTransferred: 0,
          speed: 0,
          startedAt: new Date().toISOString(),
        };
        addTransfer(transfer);
      });
    },
    [addTransfer],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
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
              Supports images, videos, documents, ZIP, ISO, and large files (100GB+)
            </p>
            <label className="mt-4 cursor-pointer">
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && handleFiles(e.target.files)}
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
                          </p>
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
                            onClick={() =>
                              updateTransfer(transfer.id, { status: "transferring" })
                            }
                            aria-label="Resume transfer"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {transfer.status === "transferring" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => updateTransfer(transfer.id, { status: "paused" })}
                            aria-label="Pause transfer"
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {transfer.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              updateTransfer(transfer.id, {
                                status: "pending",
                                progress: 0,
                                bytesTransferred: 0,
                              })
                            }
                            aria-label="Retry transfer"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTransfer(transfer.id)}
                          aria-label="Cancel transfer"
                        >
                          <X className="h-4 w-4" />
                        </Button>
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
