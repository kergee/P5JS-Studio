/** A failed write retains the newest value. All writes are serialized. */
export function createPendingNotes(write: (path: string, value: string) => Promise<void>, onError: (error: unknown) => void, delay = 500) {
  let pending: { path: string; value: string } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  const flush = async (): Promise<void> => {
    clearTimeout(timer);
    if (running) { await running; return flush(); }
    if (!pending) return;
    const entry = pending;
    running = write(entry.path, entry.value);
    try { await running; if (pending === entry) pending = undefined; }
    finally { running = undefined; }
    if (pending) await flush();
  };
  return {
    schedule(path: string, value: string) {
      pending = { path, value }; clearTimeout(timer);
      timer = setTimeout(() => { void flush().catch(onError); }, delay);
    },
    flush,
    dispose() { clearTimeout(timer); },
  };
}
