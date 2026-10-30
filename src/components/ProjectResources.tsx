import { checkProjectDependencies, dependencyText } from "../lib/projectDependencies";
import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { tauriApi, type AssetEntry } from "../lib/tauri";
import { type Language } from "../lib/language";
import { isLightTheme, type ColorTheme } from "../lib/theme";
import { workflowText } from "../lib/workflowText";

export default function ProjectResources({ name, theme, language, ensureSaved, onAssetsChanged, onBusyChange, libraries, assets, onLibrariesChange, codeFiles, disabled }: {
  name: string; theme: ColorTheme; language: Language;
  ensureSaved: () => Promise<boolean>; onAssetsChanged: () => Promise<unknown>;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean; codeFiles: string[]; libraries: string[]; assets: Record<string, string>; onLibrariesChange: (libraries: string[]) => void;
}) {
  const w = workflowText(language);
  const d = dependencyText[language];
  const [selectedLibrary, setSelectedLibrary] = useState("");
  const dependencies = useMemo(() => checkProjectDependencies(libraries, assets), [libraries, assets]);
  const availableScripts = Object.keys(assets).filter((path) => /\.js$/i.test(path) && !codeFiles.includes(path) && !libraries.includes(path)).sort();
  const moveLibrary = (index: number, offset: number) => {
    const next = [...libraries];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onLibrariesChange(next);
  };
  const [entries, setEntries] = useState<AssetEntry[]>([]);
  const [folder, setFolder] = useState("assets");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = busy || disabled;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const refresh = async () => { setEntries(await tauriApi.listProjectAssets(name)); await onAssetsChanged(); };
  const addPaths = async (paths: string[]) => {
    if (locked || !paths.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (!await ensureSaved()) return;
      const added = await tauriApi.addProjectAssets(name, paths, folder.replace(/\\/g, "/"), overwrite);
      await refresh(); setMessage(`${w.done}: ${added.join(", ")}`);
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  useEffect(() => {
    let cancelled = false;
    tauriApi.listProjectAssets(name).then((value) => { if (!cancelled) setEntries(value); }).catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [name]);
  // This listener is only mounted while the resource panel is visible.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (event.payload.type === "drop") void addPaths(event.payload.paths);
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch((e) => setError(String(e)));
    return () => { disposed = true; unlisten?.(); };
  }, [name, folder, overwrite, busy, disabled, ensureSaved, onAssetsChanged]);
  const inputClass = `border rounded px-2 py-1 ${isLightTheme(theme) ? "bg-white border-gray-300" : "bg-gray-700 border-gray-500"}`;
  return <section aria-label={w.resources} className="border-b p-3 text-sm max-h-64 overflow-auto">
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={locked} className="bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-50" onClick={async () => {
        try {
          const selected = await open({ multiple: true });
          if (selected) await addPaths(Array.isArray(selected) ? selected : [selected]);
        } catch (e) { setError(String(e)); }
      }}>{busy ? w.working : w.addResources}</button>
      <label>{w.resourceFolder} <input aria-label={w.resourceFolder} className={inputClass} value={folder} disabled={locked} onChange={(e) => setFolder(e.target.value)} /></label>
      <label><input type="checkbox" checked={overwrite} disabled={locked} onChange={(e) => setOverwrite(e.target.checked)} /> {w.overwriteAssets}</label>
    </div>
    <p className="text-xs opacity-70 my-2">{w.resourceHint}</p>
    {error && <p role="alert" className="text-red-500 whitespace-pre-wrap">{error}</p>}
    {message && <p role="status" className="text-green-600 break-all">{message}</p>}
    {!entries.length && <p className="opacity-60">{w.noAssets}</p>}
    {entries.map((asset) => <div className="flex items-center gap-3 py-1 border-b border-gray-500/20" key={asset.path}>
      <code className="flex-1 break-all select-text">{asset.path}</code><span className="text-xs opacity-60">{Math.ceil(asset.size / 1024)} KB</span>
      <button disabled={locked} onClick={async () => { try { await navigator.clipboard.writeText(asset.path); setMessage(w.copied); } catch (e) { setError(String(e)); } }}>{w.copyPath}</button>
      <button disabled={locked} className="text-red-500" onClick={async () => {
        if (!confirm(`${w.removeHint}\n${asset.path}`)) return;
        setBusy(true); setError("");
        try { if (await ensureSaved()) { await tauriApi.removeProjectAsset(name, asset.path); await refresh(); } }
        catch (e) { setError(String(e)); } finally { setBusy(false); }
      }}>{w.remove}</button>
    </div>)}
    <details className="mt-3 border-t border-gray-500/20 pt-2" open={dependencies.some((entry) => entry.status !== "ready") || undefined}>
      <summary className="cursor-pointer font-medium">{d.title} ({libraries.length})</summary>
      <p className="text-xs opacity-70 my-2">{d.hint}</p>
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label={d.choose} className={`${inputClass} min-w-0 max-w-full`} value={selectedLibrary} disabled={locked} onChange={(e) => setSelectedLibrary(e.target.value)}>
          <option value="">{d.choose}</option>
          {availableScripts.map((path) => <option key={path} value={path}>{path}</option>)}
        </select>
        <button disabled={locked || !availableScripts.includes(selectedLibrary)} className="border rounded px-2 py-1 disabled:opacity-50" onClick={() => {
          onLibrariesChange([...libraries, selectedLibrary]); setSelectedLibrary("");
        }}>{d.add}</button>
      </div>
      {!libraries.length && <p className="text-xs opacity-70 my-2">{d.empty}</p>}
      <ol className="my-2">
        {dependencies.map((entry, index) => <li key={`${index}:${entry.path}`} className="flex flex-wrap items-center gap-2 py-1">
          <code className="min-w-0 break-all">{index + 1}. {entry.path.startsWith("data:") ? "data:…" : entry.path}</code>
          <span className={entry.status === "ready" ? "opacity-70" : "text-red-500"}>{d[entry.status]}</span>
          <button aria-label={`${d.up}: ${index + 1}`} disabled={locked || index === 0} className="disabled:opacity-30" onClick={() => moveLibrary(index, -1)}>↑</button>
          <button aria-label={`${d.down}: ${index + 1}`} disabled={locked || index === libraries.length - 1} className="disabled:opacity-30" onClick={() => moveLibrary(index, 1)}>↓</button>
          <button disabled={locked} onClick={() => onLibrariesChange(libraries.filter((_, i) => i !== index))}>{d.remove}</button>
        </li>)}
      </ol>
      <p className="text-xs opacity-70">{d.boundary}</p>
    </details>
  </section>;
}
