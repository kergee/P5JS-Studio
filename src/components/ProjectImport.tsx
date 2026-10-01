import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { tauriApi } from "../lib/tauri";
import { Language } from "../lib/language";
import { ColorTheme, isLightTheme } from "../lib/theme";
import { workflowText } from "../lib/workflowText";
import WorkflowDialog from "./WorkflowDialog";

export default function ProjectImport({ currentPath, language, theme, onClose, onImported }: {
  currentPath: string; language: Language; theme: ColorTheme; onClose: () => void; onImported: () => Promise<void>;
}) {
  const w = workflowText(language);
  const [folders, setFolders] = useState<string[]>([]);
  const [target, setTarget] = useState(currentPath);
  const [paths, setPaths] = useState<string[]>([]);
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    tauriApi.listFolders().then((items) => { if (!cancelled) setFolders(items); }).catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, []);
  const inputClass = `border rounded px-3 py-2 w-full ${isLightTheme(theme) ? "bg-white border-gray-300" : "bg-gray-700 border-gray-500"}`;
  return <WorkflowDialog title={w.importTitle} theme={theme}>
    <label className="block mb-3">{w.target}
      <select aria-label={w.target} className={inputClass} value={target} disabled={busy} onChange={(e) => setTarget(e.target.value)}>
        <option value="">{w.home}</option>
        {Array.from(new Set([...folders, ...(currentPath ? [currentPath] : [])])).filter((p) => p && p !== "public").map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </label>
    <button disabled={busy} onClick={async () => {
      const name = prompt(w.newFolder); if (!name) return;
      try { const created = await tauriApi.createFolder(target, name.trim()); setFolders(await tauriApi.listFolders()); setTarget(created); }
      catch (e) { setError(String(e)); }
    }}>{w.newFolder}</button>
    <div className="my-4">
      <button disabled={busy} className="bg-blue-600 text-white rounded px-3 py-2" onClick={async () => {
        try { const selected = await open({ multiple: true, filters: [{ name: "Project ZIP", extensions: ["zip"] }] }); if (selected) { setPaths(Array.isArray(selected) ? selected : [selected]); setResults([]); } }
        catch (e) { setError(String(e)); }
      }}>{w.chooseZips}</button>
      <ul className="mt-2 text-sm max-h-40 overflow-auto select-text">{paths.map((p) => <li key={p}>{p.split(/[\\/]/).pop()}</li>)}</ul>
    </div>
    <label className="text-sm"><input disabled={busy} type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> {w.skipExisting}</label>
    {error && <p role="alert" className="text-red-500 mt-3 select-text">{error}</p>}
    <ul role="status" className="text-sm mt-3 max-h-48 overflow-auto select-text">{results.map((r, i) => <li key={i} className="break-all">{r}</li>)}</ul>
    <div className="flex justify-end gap-4 mt-5">
      <button disabled={busy} onClick={onClose}>{w.close}</button>
      <button disabled={busy || !paths.length} className="bg-green-600 text-white rounded px-4 py-2 disabled:opacity-50" onClick={async () => {
        setBusy(true); setResults([]); setError("");
        try {
          for (const path of paths) {
            const file = path.split(/[\\/]/).pop();
            try { const imported = await tauriApi.importProjectZip(path, target, skip); setResults((r) => [...r, imported ? `${w.imported}: ${imported}` : `${w.skipped}: ${file}`]); }
            catch (e) { setResults((r) => [...r, `${w.failed}: ${file} — ${String(e)}`]); }
          }
          await onImported();
        } catch (e) { setError(String(e)); } finally { setBusy(false); setPaths([]); }
      }}>{busy ? w.working : w.import}</button>
    </div>
  </WorkflowDialog>;
}
