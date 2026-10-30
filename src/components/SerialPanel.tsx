import { useEffect, useState } from "react";
import { serialApi, serialError, serialText, type SerialPort } from "../lib/serial";
import type { SerialController } from "../store/useSerial";
import type { Language } from "../lib/language";
import { isLightTheme, type ColorTheme } from "../lib/theme";

export default function SerialPanel({ serial, project, theme, language }: { serial: SerialController; project: string | null; theme: ColorTheme; language: Language }) {
  const [ports, setPorts] = useState<SerialPort[]>([]);
  const [port, setPort] = useState("");
  const [baud, setBaud] = useState(115200);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [localError, setLocalError] = useState("");
  const t = serialText[language];
  const light = isLightTheme(theme);
  useEffect(() => { setLocalError(""); }, [serial.error, serial.session?.id]);
  const control = `min-w-0 rounded border px-2 py-1 outline-none focus:border-blue-500 disabled:opacity-50 ${light ? "bg-white border-gray-300 text-gray-900" : "bg-gray-800 border-gray-600 text-gray-100"}`;
  useEffect(() => {
    let active = true;
    setLoading(true);
    serialApi.ports().then((items) => { if (active) { setPorts(items); setPort((value) => items.some((item) => item.name === value) ? value : items[0]?.name ?? ""); } })
      .catch((error) => { if (active) setLocalError(String(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const refresh = async () => {
    setLoading(true); setLocalError("");
    try { const items = await serialApi.ports(); setPorts(items); setPort((value) => items.some((item) => item.name === value) ? value : items[0]?.name ?? ""); }
    catch (error) { setLocalError(String(error)); } finally { setLoading(false); }
  };
  const send = async () => {
    if (sending) return;
    setSending(true); setLocalError("");
    try { await serial.writeLine(message); setMessage(""); }
    catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); }
    finally { setSending(false); }
  };
  return <section aria-label="ESP32 USB" className="h-full min-h-0 overflow-auto p-2 text-xs select-text">
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 basis-32">{t.port}
        <select aria-label={t.port} value={serial.session?.port ?? port} disabled={loading || serial.busy || !!serial.session}
          onChange={(event) => setPort(event.target.value)} className={`${control} block w-full mt-1`}>
          {!ports.length && <option value="">{t.noPorts}</option>}
          {ports.map((item) => <option key={item.name} value={item.name}>{item.label}</option>)}
        </select>
      </label>
      <button type="button" aria-label={t.refresh} title={t.refresh} onClick={() => void refresh()} disabled={loading || serial.busy || !!serial.session} className={control}>↻</button>
      <label className="w-24 max-w-full">{t.baud}
        <input type="number" min={1} max={5000000} step={1} aria-label={t.baud} value={serial.session?.baudRate ?? baud}
          onChange={(event) => setBaud(Number(event.target.value))} disabled={serial.busy || !!serial.session} className={`${control} block w-full mt-1`} />
      </label>
      <button type="button" disabled={serial.busy || loading || (!serial.session && (!project || !serial.ready || !port || !Number.isInteger(baud) || baud < 1 || baud > 5000000))}
        onClick={() => { setLocalError(""); void (serial.session ? serial.disconnect() : serial.connect(port, baud)); }}
        className={`${control} ${serial.session ? "text-red-500" : "text-blue-500"}`}>
        {serial.busy ? t.connecting : serial.session ? t.disconnect : t.connect}
      </button>
    </div>
    <p role="status" className={`mt-2 ${serial.session ? "text-green-600" : "opacity-70"}`}>{serial.session ? `${t.connected} · ${serial.session.port}` : t.disconnected}</p>
    {!project && <p className="text-amber-500">{t.saveFirst}</p>}
    {(localError || serial.error) && <p role="alert" className="text-red-500 break-words whitespace-pre-wrap">{serialError(localError || serial.error, language)}</p>}
    <div className="flex flex-wrap gap-3 mt-2">
      <button type="button" aria-pressed={serial.paused} onClick={serial.togglePause}>{serial.paused ? t.resume : t.pause}</button>
      <button type="button" onClick={serial.clear}>{t.clear}</button>
      <span className="opacity-60">{t.hint}</span>
    </div>
    <pre aria-label={language === "zh-CN" ? "串口接收数据" : "Serial received data"} className={`my-2 max-h-32 min-h-10 overflow-auto whitespace-pre-wrap break-all rounded p-2 font-mono ${light ? "bg-gray-50" : "bg-gray-950"}`}>{serial.lines.length ? serial.lines.join("\n") : t.waiting}</pre>
    <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="flex flex-wrap gap-2">
      <input aria-label={t.input} placeholder={t.input} value={message} onChange={(event) => setMessage(event.target.value)} disabled={sending || !serial.session}
        className={`${control} min-w-0 flex-1 basis-28`} />
      <button type="submit" disabled={!serial.session || sending} className={control}>{t.send}</button>
    </form>
  </section>;
}
