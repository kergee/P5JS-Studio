import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { serialApi, type SerialEvent, type SerialSession } from "../lib/serial";
import { validSerialLine } from "../lib/serialProtocol";

export function useSerial(project: string | null, enabled: boolean) {
  const [context, setContext] = useState({ project, owner: "" });
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<SerialSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const sessionRef = useRef<SerialSession | null>(null);
  const contextRef = useRef("");
  const listeners = useRef(new Set<(lines: string[]) => void>());
  const terminal = useRef(new Set<string>());
  const action = useRef(false);
  const owner = context.project === project ? context.owner : "";

  useEffect(() => {
    if (!enabled || !project) return;
    const id = crypto.randomUUID();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    contextRef.current = id; sessionRef.current = null; action.current = false; terminal.current.clear();
    setContext({ project, owner: id }); setSession(null); setBusy(false); setError(""); setLines([]); setReady(false);
    listen<SerialEvent>("p5studio-serial", ({ payload: event }) => {
      if (disposed || event.owner !== id) return;
      if (!event.connected) terminal.current.add(event.session);
      if (sessionRef.current?.id !== event.session) return;
      if (event.error) setError(event.error);
      if (!event.connected) { sessionRef.current = null; setSession(null); }
      if (event.connected && event.lines.length) {
        if (!pausedRef.current) setLines((previous) => [...previous, ...event.lines].slice(-200));
        for (const listener of listeners.current) listener(event.lines);
      }
    }).then((stop) => { if (disposed) stop(); else { unlisten = stop; setReady(true); } }).catch((reason) => { if (!disposed) setError(String(reason)); });
    return () => {
      disposed = true; unlisten?.();
      if (contextRef.current === id) { contextRef.current = ""; sessionRef.current = null; }
      void serialApi.disconnect(id, true).catch((reason) => console.error("Serial cleanup failed", reason));
    };
  }, [enabled, project]);

  const subscribe = useCallback((listener: (lines: string[]) => void) => {
    listeners.current.add(listener); return () => { listeners.current.delete(listener); };
  }, []);
  const connect = async (port: string, baud: number) => {
    if (!owner || !ready || action.current) return;
    const id = owner; action.current = true; setBusy(true); setError("");
    try {
      const connected = await serialApi.connect(id, port, baud);
      if (contextRef.current !== id) { await serialApi.disconnect(id, true); return; }
      if (terminal.current.has(connected.id)) throw new Error("device_disconnected");
      sessionRef.current = connected; setSession(connected);
    } catch (reason) { if (contextRef.current === id) setError(String(reason)); }
    finally { if (contextRef.current === id) { action.current = false; setBusy(false); } }
  };
  const disconnect = async () => {
    if (!owner || action.current) return;
    const id = owner; action.current = true; setBusy(true);
    try { await serialApi.disconnect(id); if (contextRef.current === id) { sessionRef.current = null; setSession(null); } }
    catch (reason) { if (contextRef.current === id) setError(String(reason)); }
    finally { if (contextRef.current === id) { action.current = false; setBusy(false); } }
  };
  const writeLine = useCallback(async (text: string) => {
    if (!validSerialLine(text)) throw new Error(new TextEncoder().encode(text).length > 8192 ? "line_too_long" : "single_line_only");
    const current = sessionRef.current;
    if (!current || !contextRef.current) throw new Error("not_connected");
    await serialApi.writeLine(contextRef.current, current.id, text);
  }, []);
  const release = useCallback(async () => {
    const id = contextRef.current;
    if (!id) return;
    await serialApi.disconnect(id, true);
    if (contextRef.current === id) { sessionRef.current = null; setSession(null); }
  }, []);
  return { owner, ready, session, busy, error, lines, paused, connect, disconnect, writeLine, subscribe, release,
    clear: () => setLines([]),
    togglePause: () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); },
  };
}
export type SerialController = ReturnType<typeof useSerial>;
