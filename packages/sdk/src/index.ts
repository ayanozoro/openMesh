import { DEFAULT_SETTINGS, generateId, SOCKET_EVENTS } from "@openmesh/shared";
import type { AppSettings, Device, Room } from "@openmesh/shared";

export interface OpenMeshOptions {
  serverUrl?: string;
  deviceName?: string;
  deviceId?: string;
}

export class OpenMesh {
  private _settings: AppSettings;
  private deviceId: string;
  private connected = false;

  constructor(options: OpenMeshOptions = {}) {
    this.deviceId = options.deviceId ?? generateId("dev");
    this._settings = {
      ...DEFAULT_SETTINGS,
      serverUrl: options.serverUrl ?? DEFAULT_SETTINGS.serverUrl,
      deviceName: options.deviceName ?? DEFAULT_SETTINGS.deviceName,
    };
  }

  getSettings(): AppSettings {
    return this._settings;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  async sendFile(_file: File): Promise<string> {
    if (!this.connected) throw new Error("Not connected. Call connect() first.");
    return generateId("xfer");
  }

  sendText(_content: string, _roomId?: string): void {
    if (!this.connected) throw new Error("Not connected. Call connect() first.");
  }

  async sendFolder(_files: File[]): Promise<string> {
    if (!this.connected) throw new Error("Not connected. Call connect() first.");
    return generateId("xfer");
  }

  onDeviceUpdate(_callback: (device: Device) => void): void {}

  onRoomUpdate(_callback: (room: Room) => void): void {}

  get events() {
    return SOCKET_EVENTS;
  }
}

export { SOCKET_EVENTS };
export type { Device, Room, AppSettings };
