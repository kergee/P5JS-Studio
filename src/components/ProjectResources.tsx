import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { checkProjectDependencies, dependencyText } from "../lib/projectDependencies";
import { tauriApi, type AssetEntry } from "../lib/tauri";
import { type Language } from "../lib/language";
import { isLightTheme, type ColorTheme } from "../lib/theme";
import { workflowText } from "../lib/workflowText";

type ResourceTab = "files" | "dependencies";

export default function ProjectResources({
  name, theme, language, ensureSaved, onAssetsChanged, onBusyChange,
  libraries, assets, onLibrariesChange, codeFiles, disabled, onClose,
}: {
  name: string; theme: ColorTheme; language: Language;
  ensureSaved: () => Promise<boolean>; onAssetsChanged: () => Promise<unknown>;
  onBusyChange: (busy: boolean) => void; onClose: () => void;
  disabled: boolean; codeFiles: string[]; libraries: string[];
  assets: Record<string, string>; onLibrariesChange: (libraries: string[]) => void;
}) {
  const w = workflowText(language);
  const d = dependencyText[language];
  const light = isLightTheme(theme);
  const id = useId();
  const [tab, setTab] = useState<ResourceTab>("files");
  const [entries, setEntries] = useState<AssetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState("assets");
  const [overwrite, setOverwrite] = useState(false);
  const [activeActions, setActiveActions] = useState<string | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const locked = busy || disabled;
  const dependencies = useMemo(() => checkProjectDependencies(libraries, assets), [libraries, assets]);
  const issueCount = dependencies.filter((entry) => entry.status !== "ready").length;
  const availableScripts = Object.keys(assets)
    .filter((path) => /\.js$/i.test(path) && !codeFiles.includes(path) && !libraries.includes(path))
    .sort();

  const mutateResources = useCallback(async (action: () => Promise<string>) => {
    if (disabled || loading || busyRef.current) return;
    busyRef.current = true;
    onBusyChange(true);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!await ensureSaved()) return;
      const result = await action();
      setEntries(await tauriApi.listProjectAssets(name));
      await onAssetsChanged();
      setMessage(result);
    } catch (e) {
      setError(String(e));
    } finally {
      busyRef.current = false;
      onBusyChange(false);
      setBusy(false);
    }
  }, [disabled, loading, onBusyChange, ensureSaved, name, onAssetsChanged]);

  const addPaths = useCallback(async (paths: string[]) => {
    if (!paths.length) return;
    await mutateResources(async () => {
      const added = await tauriApi.addProjectAssets(name, paths, folder.replace(/\\/g, "/"), overwrite);
      return `${w.done}: ${added.join(", ")}`;
    });
  }, [mutateResources, name, folder, overwrite, w.done]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    tauriApi.listProjectAssets(name)
      .then((value) => { if (!cancelled) setEntries(value); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [name]);

  // Native drag-and-drop is scoped to the mounted resource sidebar.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (!disposed && event.payload.type === "drop") void addPaths(event.payload.paths);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    }).catch((e) => { if (!disposed) setError(String(e)); });
    return () => { disposed = true; unlisten?.(); };
  }, [addPaths]);

  const chooseFiles = async () => {
    try {
      const selected = await open({ multiple: true });
      if (selected) await addPaths(Array.isArray(selected) ? selected : [selected]);
    } catch (e) { setError(String(e)); }
  };

  const moveLibrary = (index: number, offset: number) => {
    const next = [...libraries];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onLibrariesChange(next);
  };

  const border = light ? "border-gray-200" : "border-gray-700";
  const muted = light ? "text-gray-600" : "text-gray-400";
  const button = "rounded px-2 py-1 hover:bg-blue-500/10 focus-visible:outline-blue-500 disabled:opacity-40";
  const input = `w-full min-w-0 rounded border px-2 py-1 ${light ? "bg-white border-gray-300" : "bg-gray-900 border-gray-600"}`;
  const destination = folder.trim().replace(/\\/g, "/") || w.resourceRoot;

  return (
    <aside
      id="project-resources"
      aria-label={w.resources}
      style={{ width: "clamp(200px, 22vw, 280px)" }}
      className={`flex min-h-0 shrink-0 flex-col overflow-hidden border-r text-sm ${border} ${light ? "bg-gray-50 text-gray-900" : "bg-gray-800 text-gray-100"}`}
    >
      <header className={`shrink-0 border-b ${border}`}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <h2 className="font-semibold">{w.resources}</h2>
          <button type="button" className={button} aria-label={w.closeResources}
            title={w.closeResources} disabled={locked} onClick={onClose}>×</button>
        </div>
        <div role="tablist" aria-label={w.resources} className="flex gap-1 px-2">
          {(["files", "dependencies"] as const).map((value) => (
            <button
              type="button"
              key={value}
              id={`${id}-${value}`}
              role="tab"
              tabIndex={tab === value ? 0 : -1}
              aria-selected={tab === value}
              aria-controls={`${id}-panel`}
              className={`flex min-w-0 flex-wrap items-center justify-center gap-1 rounded-t border-b-2 px-1 py-2 text-xs hover:bg-blue-500/10 focus-visible:outline-blue-500 ${value === "files" ? "shrink-0" : "flex-1"} ${tab === value ? "border-blue-500 font-semibold" : "border-transparent"}`}
              onClick={() => { setTab(value); setActiveActions(null); }}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" || (event.key !== "End" && value === "dependencies") ? "files" : "dependencies";
                setTab(next);
                setActiveActions(null);
                document.getElementById(`${id}-${next}`)?.focus();
              }}
            >
              {value === "files" ? w.resourceFiles : w.resourceDependencies}
              <span className={`relative rounded-full bg-gray-500/10 px-1.5 ${muted}`}>
                {value === "files" ? entries.length : libraries.length}
                {value === "dependencies" && issueCount > 0 && (
                  <span role="img" title={w.resourceIssues} aria-label={`${w.resourceIssues}: ${issueCount}`}
                    className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ${light ? "bg-red-700" : "bg-red-300"}`} />
                )}
              </span>
            </button>
          ))}
        </div>
      </header>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${tab}`}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-2"
      >
        {error && <p role="alert" className={`mb-2 whitespace-pre-wrap break-all ${light ? "text-red-700" : "text-red-300"}`}>{error}</p>}
        {message && <p role="status" className={`mb-2 break-all text-xs ${light ? "text-green-700" : "text-green-300"}`}>{message}</p>}
        {tab === "files" ? (
          <>
            <div className={`mb-2 space-y-2 border-b px-1 pb-2 ${border}`}>
              <button type="button" disabled={locked || loading} className="w-full rounded bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50"
                onClick={() => void chooseFiles()}>{busy ? w.working : w.addResources}</button>
              <p className={`truncate text-xs ${muted}`} title={destination}>{w.resourceDestination} <code>{destination}</code></p>
              <details>
                <summary className={`cursor-pointer text-xs ${muted}`}>{w.resourceOptions}</summary>
                <label className="mt-2 block text-xs">
                  {w.resourceFolder}
                  <input className={`${input} mt-1`} value={folder} disabled={locked} onChange={(e) => setFolder(e.target.value)} />
                </label>
                <label className="mt-2 flex items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5 shrink-0" checked={overwrite} disabled={locked} onChange={(e) => setOverwrite(e.target.checked)} />
                  {w.overwriteAssets}
                </label>
                <p className={`mt-2 text-xs ${muted}`}>{w.resourceHint}</p>
              </details>
            </div>
            {loading && <p role="status" className={`px-1 text-xs ${muted}`}>{w.loading}</p>}
            {!loading && !error && !entries.length && <p className={`px-1 text-xs ${muted}`}>{w.noAssets}</p>}
            <ul>
              {entries.map((asset) => {
                const slash = asset.path.lastIndexOf("/");
                const filename = asset.path.slice(slash + 1);
                const directory = slash < 0 ? w.resourceRoot : asset.path.slice(0, slash);
                const expanded = activeActions === asset.path;
                return (
                  <li key={asset.path} className={`border-b px-1 py-1.5 ${border}`}>
                    <div className="flex min-w-0 items-start gap-1">
                      <div className="min-w-0 flex-1" title={asset.path}>
                        <div className="truncate font-medium">{filename}</div>
                        <div className={`flex min-w-0 gap-1.5 text-xs ${muted}`}>
                          <span className="min-w-0 flex-1 truncate">{directory}</span>
                          <span className="shrink-0">{Math.ceil(asset.size / 1024)} KB</span>
                        </div>
                      </div>
                      <button type="button" className={`${button} shrink-0`} disabled={locked}
                        aria-label={`${w.resourceActions}: ${asset.path}`} aria-expanded={expanded}
                        title={w.resourceActions}
                        onClick={() => setActiveActions(expanded ? null : asset.path)}>…</button>
                    </div>
                    {expanded && (
                      <div className="mt-1 rounded bg-gray-500/10 p-2 text-xs">
                        <code className="block break-all select-text">{asset.path}</code>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <button type="button" className={button} disabled={locked} onClick={async () => {
                            try { await navigator.clipboard.writeText(asset.path); setError(""); setMessage(w.copied); }
                            catch (e) { setError(String(e)); }
                          }}>{w.copyPath}</button>
                          <button type="button" className={`${button} ${light ? "text-red-700" : "text-red-300"}`} disabled={locked || loading}
                            onClick={() => {
                              if (!confirm(`${w.removeHint}\n${asset.path}`)) return;
                              void mutateResources(async () => {
                                await tauriApi.removeProjectAsset(name, asset.path);
                                setActiveActions(null);
                                return `${w.done}: ${asset.path}`;
                              });
                            }}>{w.remove}</button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
            <p className={`mb-2 text-xs ${muted}`}>{d.hint}</p>
            <div className="space-y-2">
              <select aria-label={d.choose} className={input} value={selectedLibrary} disabled={locked}
                onChange={(e) => setSelectedLibrary(e.target.value)}>
                <option value="">{d.choose}</option>
                {availableScripts.map((path) => <option key={path} value={path}>{path}</option>)}
              </select>
              <button type="button" className={`${button} border ${border}`}
                disabled={locked || !availableScripts.includes(selectedLibrary)}
                onClick={() => {
                  onLibrariesChange([...libraries, selectedLibrary]);
                  setSelectedLibrary("");
                }}>{d.add}</button>
            </div>
            {!libraries.length && <p className={`my-2 text-xs ${muted}`}>{d.empty}</p>}
            <ol className="my-2">
              {dependencies.map((entry, index) => (
                <li key={`${index}:${entry.path}`} className={`border-b py-2 ${border}`}>
                  <code className="block break-all select-text">{index + 1}. {entry.path.startsWith("data:") ? "data:…" : entry.path}</code>
                  <span className={`text-xs ${entry.status === "ready" ? muted : light ? "text-red-700" : "text-red-300"}`}>{d[entry.status]}</span>
                  <div className="flex flex-wrap gap-1 text-xs">
                    <button type="button" className={button} aria-label={`${d.up}: ${index + 1}`}
                      disabled={locked || index === 0} onClick={() => moveLibrary(index, -1)}>↑</button>
                    <button type="button" className={button} aria-label={`${d.down}: ${index + 1}`}
                      disabled={locked || index === libraries.length - 1} onClick={() => moveLibrary(index, 1)}>↓</button>
                    <button type="button" className={button} disabled={locked}
                      onClick={() => onLibrariesChange(libraries.filter((_, i) => i !== index))}>{d.remove}</button>
                  </div>
                </li>
              ))}
            </ol>
            <p className={`text-xs ${muted}`}>{d.boundary}</p>
          </>
        )}
      </div>
    </aside>
  );
}
