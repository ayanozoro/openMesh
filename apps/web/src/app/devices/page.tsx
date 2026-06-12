"use client";

import { motion } from "framer-motion";
import { Monitor, Wifi, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { formatRelativeTime } from "@/lib/utils";

const statusVariant = {
  online: "success" as const,
  offline: "outline" as const,
  connecting: "warning" as const,
  busy: "warning" as const,
};

export default function DevicesPage() {
  const { devices, deviceId, serverStatus } = useAppStore();
  const otherDevices = devices.filter((d) => d.id !== deviceId);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Devices</h1>
          <p className="text-muted-foreground">
            Discover and connect to devices on your local network
          </p>
        </div>
        <Button variant="secondary" disabled={serverStatus !== "connected"}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {serverStatus !== "connected" && (
        <Card className="border-destructive/30">
          <CardContent className="flex items-center gap-3 pt-2">
            <Wifi className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Not connected to signaling server. Check Settings for server URL.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            This Device
          </CardTitle>
          <CardDescription>Your current device on the network</CardDescription>
        </CardHeader>
        <CardContent>
          {devices
            .filter((d) => d.id === deviceId)
            .map((device) => (
              <div
                key={device.id}
                className="flex items-center justify-between rounded-lg border border-glass-border bg-white/5 p-4"
              >
                <div>
                  <p className="font-medium">{device.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{device.id}</p>
                </div>
                <Badge variant="success">online</Badge>
              </div>
            ))}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">
          Network Devices ({otherDevices.length})
        </h2>

        {otherDevices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Monitor className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="font-medium">No other devices found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Open OpenMesh on another device on the same network to discover it here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            className="space-y-2"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.05 } },
            }}
          >
            {otherDevices.map((device) => (
              <motion.div
                key={device.id}
                variants={{
                  hidden: { opacity: 0, x: -10 },
                  show: { opacity: 1, x: 0 },
                }}
              >
                <Card>
                  <CardContent className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Monitor className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{device.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{device.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(device.lastSeen)}
                      </span>
                      <Badge variant={statusVariant[device.status]}>{device.status}</Badge>
                      <Badge variant="outline">{device.connectionType}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
