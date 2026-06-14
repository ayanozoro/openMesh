export type DCMessage = { t: string; p: any } | { t: "CHUNK"; p: ArrayBuffer };

export function encodeMessage(type: string, payload: any): string {
  return JSON.stringify({ t: type, p: payload });
}

export function decodeMessage(data: unknown): DCMessage {
  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data as string);
      return { t: parsed.t, p: parsed.p };
    } catch (_) {
      return { t: "TEXT", p: data };
    }
  }

  if (data instanceof ArrayBuffer) {
    return { t: "CHUNK", p: data };
  }

  // For Blob and other types, attempt to handle via string
  return { t: "TEXT", p: String(data) };
}
