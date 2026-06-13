import { Bonjour } from "bonjour-service";
import os from "node:os";
import type { DeviceRegistry } from "./registry.js";
import type { Server } from "socket.io";
import { SOCKET_EVENTS, type Device } from "@openmesh/shared";

export class LANDiscoveryService {
  private bonjour: Bonjour | null = null;
  private registry: DeviceRegistry;
  private io: Server;
  private port: number;
  private deviceId: string;
  private deviceName: string;

  constructor(registry: DeviceRegistry, io: Server, port: number) {
    this.registry = registry;
    this.io = io;
    this.port = port;

    const hostname = os.hostname();
    this.deviceId = `dev_server_${hostname.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    this.deviceName = `OpenMesh on ${hostname}`;
  }

  start() {
    try {
      this.bonjour = new Bonjour();
      const ip = this.getLocalIp();

      console.log(`[discovery] Starting LAN mDNS discovery on IP: ${ip}, port: ${this.port}`);

      // Advertise our service
      this.bonjour.publish({
        name: this.deviceName,
        type: "openmesh",
        protocol: "tcp",
        port: this.port,
        txt: {
          id: this.deviceId,
          platform: process.platform,
          ip: ip,
        },
      });
      console.log(`[discovery] Service advertised: ${this.deviceName} (_openmesh._tcp.local)`);

      // Browse for other openmesh services
      const browser = this.bonjour.find({
        type: "openmesh",
        protocol: "tcp",
      });

      browser.on("up", (service) => {
        const txt = service.txt || {};
        const remoteDeviceId = txt.id;

        // Skip our own service
        if (!remoteDeviceId || remoteDeviceId === this.deviceId) return;

        console.log(`[discovery] Found LAN device: ${service.name} (${remoteDeviceId})`);

        const ipAddress = service.addresses?.[0] || txt.ip || "127.0.0.1";

        const device: Device = {
          id: remoteDeviceId,
          name: service.name,
          status: "online",
          connectionType: "lan",
          ipAddress: ipAddress,
          lastSeen: new Date().toISOString(),
          platform: txt.platform || "unknown",
        };

        this.registry.registerDiscoveryDevice(device);
        this.io.emit(SOCKET_EVENTS.DEVICE_UPDATE, device);
      });

      browser.on("down", (service) => {
        const txt = service.txt || {};
        const remoteDeviceId = txt.id;

        if (!remoteDeviceId || remoteDeviceId === this.deviceId) return;

        console.log(`[discovery] LAN device offline: ${service.name} (${remoteDeviceId})`);

        const device = this.registry.get(remoteDeviceId);
        if (device) {
          const updated = this.registry.updateStatus(remoteDeviceId, "offline");
          if (updated) {
            this.io.emit(SOCKET_EVENTS.DEVICE_UPDATE, updated);
          }
        }
      });
    } catch (error) {
      console.error("[discovery] Failed to start LAN Discovery:", error);
    }
  }

  stop() {
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
      console.log("[discovery] Stopped LAN mDNS discovery");
    }
  }

  private getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const networkInterface = interfaces[name];
      if (networkInterface) {
        for (const net of networkInterface) {
          if (net.family === "IPv4" && !net.internal) {
            return net.address;
          }
        }
      }
    }
    return "127.0.0.1";
  }
}
