export function generateId(prefix = ""): string {
  let random: string;
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    random = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  } else if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    const arr = new Uint8Array(6);
    globalThis.crypto.getRandomValues(arr);
    random = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  } else {
    random = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
  return prefix ? `${prefix}_${random}` : random;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function createApiResponse<T>(
  success: boolean,
  data?: T,
  error?: string,
): { success: boolean; data?: T; error?: string; timestamp: string } {
  return {
    success,
    data,
    error,
    timestamp: new Date().toISOString(),
  };
}

export function getDevicePlatform(): string {
  if (typeof globalThis.navigator === "undefined") return "server";
  const ua = globalThis.navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua)) return "macos";
  if (/Linux/i.test(ua)) return "linux";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad/i.test(ua)) return "ios";
  return "unknown";
}

export function getDefaultDeviceName(): string {
  const platform = getDevicePlatform();
  const names: Record<string, string> = {
    windows: "Windows PC",
    macos: "Mac",
    linux: "Linux Machine",
    android: "Android Device",
    ios: "iPhone",
    unknown: "OpenMesh Device",
    server: "OpenMesh Server",
  };
  return names[platform] ?? "OpenMesh Device";
}
