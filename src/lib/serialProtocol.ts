export const SERIAL_MAX_BYTES = 8192;
export interface SerialScope { owner: string; project: string; run: string }

export function validSerialLine(text: unknown): text is string {
  return typeof text === "string" && !/[\r\n]/.test(text) && new TextEncoder().encode(text).length <= SERIAL_MAX_BYTES;
}

export function matchesSerialScope(value: unknown, scope: SerialScope): boolean {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return Boolean(scope.owner) && data.owner === scope.owner && data.project === scope.project && data.run === scope.run;
}

// Self-contained so it can be embedded before the user's sketch and tested in a VM.
export function serialFrameBootstrap(scope: SerialScope) {
  const handlers = new Set<(line: string) => void>();
  const pending = new Map<number, { resolve: () => void; reject: (error: Error) => void; timer: number }>();
  let connected = false;
  let next = 0;
  const send = (type: string, extra: object = {}) => window.parent.postMessage({ type, ...scope, ...extra }, "*");
  const api = Object.freeze({
    get connected() { return connected; },
    onLine(handler: (line: string) => void) {
      if (typeof handler !== "function") throw new TypeError("onLine requires a function");
      handlers.add(handler); return () => { handlers.delete(handler); };
    },
    writeLine(text: string): Promise<void> {
      if (typeof text !== "string" || /[\r\n]/.test(text) || new TextEncoder().encode(text).length > 8192) return Promise.reject(new Error("Expected one UTF-8 line, at most 8192 bytes"));
      if (!connected) return Promise.reject(new Error("ESP32 is not connected"));
      const id = ++next;
      return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => { pending.delete(id); reject(new Error("Serial send timed out")); }, 3000);
        pending.set(id, { resolve, reject, timer }); send("p5studio_serial_write", { id, text });
      });
    },
  });
  Object.defineProperty(window, "studioSerial", { value: api, writable: false, configurable: false });
  const rejectPending = () => {
    for (const request of pending.values()) { window.clearTimeout(request.timer); request.reject(new Error("Serial disconnected")); }
    pending.clear();
  };
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.owner !== scope.owner || data.project !== scope.project || data.run !== scope.run) return;
    if (data.type === "p5studio_serial_status") { connected = data.connected === true; if (!connected) rejectPending(); }
    if (data.type === "p5studio_serial_lines" && connected && Array.isArray(data.lines)) {
      for (const line of data.lines) {
        if (typeof line !== "string") continue;
        for (const handler of [...handlers]) { try { handler(line); } catch (error) { console.error(error); } }
      }
    }
    if (data.type === "p5studio_serial_reply") {
      const request = pending.get(data.id); if (!request) return;
      pending.delete(data.id); window.clearTimeout(request.timer);
      if (data.error) request.reject(new Error(String(data.error))); else request.resolve();
    }
  });
  window.addEventListener("pagehide", () => { connected = false; handlers.clear(); rejectPending(); });
  send("p5studio_serial_ready");
}

export function serialBootstrapSource(scope: SerialScope): string {
  return `(${serialFrameBootstrap.toString()})(${JSON.stringify(scope)})`;
}
