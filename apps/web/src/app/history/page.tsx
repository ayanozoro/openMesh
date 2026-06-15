"use client";

import { motion } from "framer-motion";
import { History, ArrowUp, ArrowDown, FileText, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { formatBytes } from "@openmesh/shared";

export default function HistoryPage() {
  const { transferHistory, clearHistory } = useAppStore();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">History</h1>
          <p className="text-muted-foreground">View your past file transfers</p>
        </div>
        {transferHistory.length > 0 && (
          <Button variant="secondary" size="sm" onClick={clearHistory} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Transfer History
          </CardTitle>
          <CardDescription>
            Completed and failed transfers persisted locally
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transferHistory.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <FileText className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-medium">No transfer history yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Completed transfers will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transferHistory.map((entry, i) => (
                <motion.div
                  key={`${entry.id}-${entry.completedAt}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between rounded-lg border border-glass-border bg-white/5 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        entry.direction === "send" ? "bg-primary/10" : "bg-accent/10"
                      }`}
                    >
                      {entry.direction === "send" ? (
                        <ArrowUp className="h-4 w-4 text-primary" />
                      ) : (
                        <ArrowDown className="h-4 w-4 text-accent" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{entry.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(entry.fileSize)} · {entry.deviceName}
                        {entry.roomName ? ` · ${entry.roomName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {entry.completedAt
                        ? new Date(entry.completedAt).toLocaleDateString()
                        : "—"}
                    </span>
                    <Badge variant={entry.status === "completed" ? "success" : "destructive"}>
                      {entry.status}
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
