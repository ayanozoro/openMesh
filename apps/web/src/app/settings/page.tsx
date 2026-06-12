"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/app-store";
import { CHUNK_SIZE_OPTIONS } from "@openmesh/shared";

export default function SettingsPage() {
  const { settings, setSettings, deviceId } = useAppStore();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure your OpenMesh experience</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Device</CardTitle>
          <CardDescription>Your device identity on the network</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="deviceName" className="text-sm font-medium">
              Device Name
            </label>
            <Input
              id="deviceName"
              value={settings.deviceName}
              onChange={(e) => setSettings({ deviceName: e.target.value })}
              placeholder="My Device"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Device ID</label>
            <Input value={deviceId} readOnly className="font-mono text-xs opacity-60" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
          <CardDescription>Signaling server configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="serverUrl" className="text-sm font-medium">
              Server URL
            </label>
            <Input
              id="serverUrl"
              value={settings.serverUrl}
              onChange={(e) => setSettings({ serverUrl: e.target.value })}
              placeholder="http://localhost:4000"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.discoveryEnabled}
              onChange={(e) => setSettings({ discoveryEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-glass-border bg-white/5 accent-primary"
            />
            <span className="text-sm">Enable device discovery</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfer</CardTitle>
          <CardDescription>File transfer preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="chunkSize" className="text-sm font-medium">
              Chunk Size
            </label>
            <select
              id="chunkSize"
              value={settings.chunkSize}
              onChange={(e) => setSettings({ chunkSize: Number(e.target.value) })}
              className="flex h-10 w-full rounded-lg border border-glass-border bg-white/5 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {CHUNK_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-background">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.autoAcceptTransfers}
              onChange={(e) => setSettings({ autoAcceptTransfers: e.target.checked })}
              className="h-4 w-4 rounded border-glass-border bg-white/5 accent-primary"
            />
            <span className="text-sm">Auto-accept incoming transfers</span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Encryption and privacy settings</CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enableEncryption}
              onChange={(e) => setSettings({ enableEncryption: e.target.checked })}
              className="h-4 w-4 rounded border-glass-border bg-white/5 accent-primary"
            />
            <div>
              <span className="text-sm font-medium">Enable encryption</span>
              <p className="text-xs text-muted-foreground">AES-256-GCM end-to-end encryption</p>
            </div>
          </label>
        </CardContent>
      </Card>

      <Button
        variant="secondary"
        onClick={() => {
          localStorage.removeItem("openmesh-storage");
          window.location.reload();
        }}
      >
        Reset to Defaults
      </Button>
    </div>
  );
}
