import { historyField } from "@codemirror/commands";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { draftKey, parseDraft, type EditorDraft } from "../lib/editorDraft";
import { combineSources, locateSource } from "../lib/sourceLocations";
import { pcWorkflowText } from "../lib/pcWorkflowText";
import { checkProjectDependencies, dependencyText } from "../lib/projectDependencies";
import { useState, useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ProjectResources from "./ProjectResources";
import WorkflowDialog from "./WorkflowDialog";
import { workflowText } from "../lib/workflowText";
import { getRuntime, RUNTIMES, readDefaultVersion } from "../lib/runtimes";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import Preview from "./Preview";
import FileTabs from "./FileTabs";
import ThemeToggle from "./ThemeToggle";
import { DebugMessage } from "../lib/debug";
import { formatJavaScript } from "../lib/formatCode";
import { Language, text } from "../lib/language";
import { p5CompletionExtension } from "../lib/p5Completions";
import { getJavaScriptDiagnostics, p5LintExtension } from "../lib/p5Diagnostics";
import { checkJavaScriptSyntax } from "../lib/syntaxCheck";
import { tauriApi, SketchAssets, SketchFile } from "../lib/tauri";
import { ColorTheme, isLightTheme } from "../lib/theme";
import { useSketchStore } from "../store/useSketchStore";
import { useSerial } from "../store/useSerial";
import { serialText } from "../lib/serial";

const MIN_EDITOR_FONT_SIZE = 10;
const MAX_EDITOR_FONT_SIZE = 24;
const DEFAULT_EDITOR_FONT_SIZE = 13;
const EDITOR_FONT_SIZE_KEY = "p5js-studio-editor-font-size";
const MIN_EDITOR_WIDTH_PERCENT = 25;
const MAX_EDITOR_WIDTH_PERCENT = 75;
const DEFAULT_EDITOR_WIDTH_PERCENT = 50;
const EDITOR_PREVIEW_SPLIT_KEY = "p5js-studio-editor-preview-split";

function clampEditorFontSize(size: number) {
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, size));
}

function clampEditorWidthPercent(width: number) {
  return Math.min(MAX_EDITOR_WIDTH_PERCENT, Math.max(MIN_EDITOR_WIDTH_PERCENT, width));
}

function readStoredEditorWidthPercent() {
  const value = localStorage.getItem(EDITOR_PREVIEW_SPLIT_KEY);
  const stored = value === null ? NaN : Number(value);
  return Number.isFinite(stored)
    ? clampEditorWidthPercent(stored)
    : DEFAULT_EDITOR_WIDTH_PERCENT;
}

function joinPath(parent: string, child: string) {
  return parent ? `${parent}/${child}` : child;
}

function parentPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function basename(path: string) {
  return path.split("/").filter(Boolean).pop() ?? path;
}

function sanitizeSketchName(value: string) {
  return value
    .replace(/[\\:*?"<>|]/g, "")
    .replace(/\//g, "")
    .trim();
}

interface EditorProps {
  initialName?: string;
  onBack: () => void;
  theme: ColorTheme;
  onToggleTheme: () => void;
  language: Language;
}

export default function Editor({ initialName, onBack, theme, onToggleTheme, language }: EditorProps) {
  const [files, setFiles] = useState<SketchFile[]>([{ name: "sketch.js", code: "" }]);
  const [activeFile, setActiveFile] = useState("sketch.js");
  const [name, setName] = useState(initialName ?? "untitled");
  const [editingName, setEditingName] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [assets, setAssets] = useState<SketchAssets>({});
  const [libraries, setLibraries] = useState<string[]>([]);
  const [runTrigger, setRunTrigger] = useState(0);
  const [p5Version, setP5Version] = useState(readDefaultVersion);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [persistedName, setPersistedName] = useState<string | null>(initialName ?? null);
  const [loaded, setLoaded] = useState(false);
  const [operationBusy, setBusy] = useState(false);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [draftCandidate, setDraftCandidate] = useState<EditorDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [draftUnreadable, setDraftUnreadable] = useState(false);
  const [draftBackedUp, setDraftBackedUp] = useState(false);
  const draftChecked = useRef(false);
  const busy = operationBusy || resourceBusy || !!draftCandidate || draftUnreadable;
  const [operationError, setOperationError] = useState("");
  const [operationMessage, setOperationMessage] = useState("");
  const [showResources, setShowResources] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [serialEnabled, setSerialEnabled] = useState(false);
  const [serialOpenTrigger, setSerialOpenTrigger] = useState(0);
  const serialSupported = /Windows/.test(navigator.userAgent);
  const serial = useSerial(persistedName, serialEnabled && serialSupported);
  const st = serialText[language];
  useEffect(() => {
    if (!showTools) return;
    const outside = (event: PointerEvent) => { if (!toolsRef.current?.contains(event.target as Node)) setShowTools(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setShowTools(false); };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [showTools]);
  const [leaveAction, setLeaveAction] = useState<"gallery" | "window" | null>(null);
  const [runningVersion, setRunningVersion] = useState("");
  const savingRef = useRef(false);
  const operationRef = useRef(false);
  const w = workflowText(language);
  const pc = pcWorkflowText[language];
  const codeMirrorRef = useRef<ReactCodeMirrorRef>(null);
  const fileSessions = useRef(new Map<string, { json: ReturnType<import("@codemirror/state").EditorState["toJSON"]>; top: number; left: number }>());
  const pendingLocation = useRef<DebugMessage | null>(null);
  const clearDraft = (project: string | null) => { localStorage.removeItem(draftKey(project)); setDraftBackedUp(false); };
  const checkRecovery = (base: string, project: string | null) => {
    try {
      const raw = localStorage.getItem(draftKey(project));
      if (raw) {
        const candidate = parseDraft(raw);
        if (JSON.stringify(candidate.content) !== base) setDraftCandidate(candidate);
        else clearDraft(project);
      }
    } catch (error) { setDraftUnreadable(true); setDraftError(String(error)); }
    draftChecked.current = true;
  };
  const [formatMsg, setFormatMsg] = useState<string | null>(null);
  const [debugMessages, setDebugMessages] = useState<DebugMessage[]>([]);
  const [editorWidthPercent, setEditorWidthPercent] = useState(readStoredEditorWidthPercent);
  const [isResizing, setIsResizing] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    const value = localStorage.getItem(EDITOR_FONT_SIZE_KEY);
    const stored = value === null ? NaN : Number(value);
    return Number.isFinite(stored)
      ? clampEditorFontSize(stored)
      : DEFAULT_EDITOR_FONT_SIZE;
  });
  const { addSketch, removeSketch } = useSketchStore();
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const pendingThumbnail = useRef<string | null>(null);
  const light = isLightTheme(theme);
  const t = text[language];
  const subtleButtonClass = light
    ? "text-gray-600 hover:text-gray-950 hover:bg-gray-100"
    : "text-gray-400 hover:text-white hover:bg-gray-700";

  const snapshot = JSON.stringify({ name, files, notes, libraries, p5Version });
  const dirty = loaded && snapshot !== savedSnapshot;

  useEffect(() => {
    let cancelled = false;
    if (!initialName) { checkRecovery(snapshot, null); setSavedSnapshot(snapshot); setLoaded(true); return; }
    Promise.all([tauriApi.getSketch(initialName), tauriApi.getSketchAssets(initialName)])
      .then(([data, nextAssets]) => {
        if (cancelled) return;
        const nextFiles = data.files.length ? data.files : [{ name: "sketch.js", code: "" }];
        setFiles(nextFiles); setActiveFile(nextFiles[0].name); setNotes(data.notes);
        setLibraries(data.libraries); setP5Version(data.p5Version); setAssets(nextAssets);
        const base = JSON.stringify({ name: initialName, files: nextFiles, notes: data.notes, libraries: data.libraries, p5Version: data.p5Version });
        setSavedSnapshot(base);
        checkRecovery(base, initialName);
        setLoaded(true);
      }).catch((e) => { if (!cancelled) setOperationError(String(e)); });
    return () => { cancelled = true; };
  }, [initialName]);

  useEffect(() => {
    if (!loaded || !draftChecked.current || draftCandidate || draftUnreadable || savedSnapshot === null) return;
    if (!dirty) { try { clearDraft(persistedName); } catch (error) { setDraftError(String(error)); } return; }
    try {
      const draft: EditorDraft = { schema: 1, base: savedSnapshot, updatedAt: Date.now(), content: { name, files, notes, libraries, p5Version } };
      localStorage.setItem(draftKey(persistedName), JSON.stringify(draft));
      setDraftError(""); setDraftBackedUp(true);
    } catch (error) { setDraftError(String(error)); setDraftBackedUp(false); }
  }, [loaded, snapshot, savedSnapshot, persistedName, draftCandidate, draftUnreadable, dirty]);

  const focusLocation = (message: DebugMessage) => {
    const view = codeMirrorRef.current?.view;
    if (!view || !message.line) return;
    const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, message.line)));
    const position = Math.min(line.to, line.from + Math.max(0, (message.column ?? 1) - 1));
    view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: "center" }) });
    view.focus();
    pendingLocation.current = null;
  };
  const jumpToLocation = (message: DebugMessage) => {
    if (!message.file || !files.some((file) => file.name === message.file)) return;
    if (message.file === activeFile) focusLocation(message);
    else { pendingLocation.current = message; setActiveFile(message.file); }
  };

  const activeCode = files.find((f) => f.name === activeFile)?.code ?? "";
  const displayName = basename(name);

  const startRename = () => {
    setRenameDraft(displayName);
    setEditingName(true);
  };

  const commitRename = () => {
    const nextName = sanitizeSketchName(renameDraft);
    if (nextName) {
      setName(joinPath(parentPath(name), nextName));
    }
    setEditingName(false);
  };

  useEffect(() => {
    localStorage.setItem(EDITOR_FONT_SIZE_KEY, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem(EDITOR_PREVIEW_SPLIT_KEY, String(editorWidthPercent));
  }, [editorWidthPercent]);

  const updateSplitFromClientX = useCallback((clientX: number) => {
    const rect = splitContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const nextWidth = ((clientX - rect.left) / rect.width) * 100;
    setEditorWidthPercent(Number(clampEditorWidthPercent(nextWidth).toFixed(1)));
  }, []);

  const startResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsResizing(true);
    updateSplitFromClientX(event.clientX);
  }, [updateSplitFromClientX]);

  const adjustEditorWidth = useCallback((delta: number) => {
    setEditorWidthPercent((width) => clampEditorWidthPercent(width + delta));
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      updateSplitFromClientX(event.clientX);
    };
    const stopResize = () => setIsResizing(false);
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    window.addEventListener("blur", stopResize);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      window.removeEventListener("blur", stopResize);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizing, updateSplitFromClientX]);

  const updateCode = useCallback((code: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.name === activeFile ? { ...f, code } : f))
    );
  }, [activeFile]);

  const adjustFontSize = useCallback((delta: number) => {
    setFontSize((size) => clampEditorFontSize(size + delta));
  }, []);

  const formatActiveFile = useCallback(async () => {
    try {
      const formatted = await formatJavaScript(activeCode);
      updateCode(formatted);
      setFormatMsg(t.formatted);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not format";
      setFormatMsg(message.split("\n")[0]);
    }
    setTimeout(() => setFormatMsg(null), 2500);
  }, [activeCode, t.formatted, updateCode]);

  const appendDebugMessage = useCallback((message: DebugMessage) => {
    setDebugMessages((messages) => [...messages, message].slice(-100));
  }, []);

  const combinedCode = combineSources(files);

  const save = useCallback(async (withinOperation = false): Promise<boolean> => {
    if (!loaded || draftCandidate || draftUnreadable || savingRef.current || (operationRef.current && !withinOperation)) return false;
    savingRef.current = true; setBusy(true); setOperationError(""); setOperationMessage("");
    try {
      await tauriApi.saveProject({ originalName: persistedName, name, files, notes, libraries, p5Version });
      if (persistedName && persistedName !== name) removeSketch(persistedName);
      addSketch(name); setPersistedName(name); setSavedSnapshot(snapshot);
      try { clearDraft(persistedName); if (persistedName !== name) clearDraft(name); setDraftError(""); }
      catch (error) { setDraftError(String(error)); }
      if (pendingThumbnail.current) {
        try { await tauriApi.saveThumbnail(name, pendingThumbnail.current); pendingThumbnail.current = null; }
        catch (e) { setOperationError(String(e)); }
      }
      return true;
    } catch (e) { setOperationError(`${w.saveFailed}: ${String(e)}`); return false; }
    finally { savingRef.current = false; if (!operationRef.current) setBusy(false); }
  }, [loaded, persistedName, name, files, notes, libraries, p5Version, snapshot, addSketch, removeSketch, w.saveFailed, draftCandidate, draftUnreadable]);

  const refreshAssets = useCallback(async () => {
    const nextAssets = await tauriApi.getSketchAssets(name);
    setAssets(nextAssets);
    return nextAssets;
  }, [name]);
  const exportProject = async () => {
    if (savingRef.current || operationRef.current || !loaded) return;
    operationRef.current = true; setBusy(true);
    try {
      const dest = await saveDialog({ defaultPath: `${displayName}.zip`, filters: [{ name: "ZIP", extensions: ["zip"] }] });
      if (!dest || !await save(true)) return;
      setBusy(true); setOperationMessage("");
      await tauriApi.exportProject(name, dest); setOperationMessage(`${w.done}: ${dest}`);
    } catch (e) { setOperationError(String(e)); } finally { operationRef.current = false; setBusy(false); }
  };

  const leaveEditor = useCallback(async (action: "gallery" | "window") => {
    try {
      await serial.release();
      if (action === "gallery") onBack(); else await getCurrentWindow().destroy();
    } catch (error) { setOperationError(String(error)); }
  }, [onBack, serial.release]);

  const requestLeave = useCallback((action: "gallery" | "window") => {
    if (savingRef.current || operationRef.current || resourceBusy || draftCandidate || draftUnreadable) return;
    if (dirty) setLeaveAction(action);
    else void leaveEditor(action);
  }, [dirty, leaveEditor, resourceBusy, draftCandidate, draftUnreadable]);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    getCurrentWindow().onCloseRequested((event) => { event.preventDefault(); requestLeave("window"); })
      .then((unlisten) => { if (disposed) unlisten(); else cleanup = unlisten; })
      .catch((e) => setOperationError(String(e)));
    return () => { disposed = true; cleanup?.(); };
  }, [requestLeave]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const run = useCallback(async () => {
    if (busy || !loaded || savingRef.current || operationRef.current) return;
    if (!getRuntime(p5Version)) { setOperationError(w.missingVersion); return; }
    operationRef.current = true; setBusy(true);
    try {
    if (!await save(true)) return;
    const nextAssets = await refreshAssets();
    const unavailable = checkProjectDependencies(libraries, nextAssets).filter((entry) => entry.status !== "ready");
    if (unavailable.length) {
      const d = dependencyText[language];
      setOperationError(`${d.blocked}\n${unavailable.map((entry) => `${entry.path}: ${d[entry.status]}`).join("\n")}`);
      setShowResources(true);
      return;
    }

    const diagnostics = getRuntime(p5Version)?.major === 1 ? getJavaScriptDiagnostics(combinedCode) : [];
    const staticMessages: DebugMessage[] = diagnostics.map((diagnostic) => ({
      level: diagnostic.level === "error" ? "error" : "warn",
      message: diagnostic.message,
      ...locateSource(files, diagnostic.line, diagnostic.column),
      timestamp: Date.now(),
    }));
    setDebugMessages(staticMessages);

    const syntaxError = await checkJavaScriptSyntax(combinedCode);
    if (syntaxError) {
      setDebugMessages([{
        level: "error",
        message: `SyntaxError: ${syntaxError.message}`,
        ...locateSource(files, syntaxError.line, syntaxError.column),
        timestamp: Date.now(),
      }]);
      return;
    }

    setRunningVersion(p5Version);
    setRunTrigger((t) => t + 1);
    } catch (e) { setOperationError(String(e)); }
    finally { operationRef.current = false; setBusy(false); }
  }, [loaded, combinedCode, save, p5Version, w.missingVersion, refreshAssets, libraries, language, files, busy]);

  const handleThumbnail = useCallback((dataUrl: string) => {
    pendingThumbnail.current = dataUrl;
    tauriApi
      .saveThumbnail(name, dataUrl)
      .then(() => {
        pendingThumbnail.current = null;
      })
      .catch(() => {});
  }, [name]);

  const handleAddFile = useCallback(async (fileName: string) => {
    if (files.find((f) => f.name === fileName)) return;

    setFiles((prev) => [...prev, { name: fileName, code: `// ${fileName}\n` }]);
    setActiveFile(fileName);
  }, [files]);

  const handleRemoveFile = useCallback(async (fileName: string) => {

    fileSessions.current.delete(fileName);
    setFiles((prev) => {
      const next = prev.filter((f) => f.name !== fileName);
      if (activeFile === fileName) setActiveFile(next[0]?.name ?? "");
      return next;
    });
  }, [activeFile]);

  const keymapExt = keymap.of([
    { key: "Ctrl-Enter", mac: "Ctrl-Enter", run: () => { run(); return true; } },
    { key: "Ctrl-s", mac: "Cmd-s", run: () => { save(); return true; } },
    { key: "Ctrl-=", mac: "Cmd-=", run: () => { adjustFontSize(1); return true; } },
    { key: "Ctrl-+", mac: "Cmd-+", run: () => { adjustFontSize(1); return true; } },
    { key: "Ctrl--", mac: "Cmd--", run: () => { adjustFontSize(-1); return true; } },
    { key: "Shift-Alt-f", mac: "Shift-Alt-f", run: () => { formatActiveFile(); return true; } },
  ]);

  return (
    <div className={`flex flex-col h-screen select-none ${light ? "bg-gray-50" : "bg-gray-900"}`}>
      {/* Toolbar */}
      <div
        className={`flex flex-wrap items-center gap-2 px-4 py-2 border-b shrink-0 ${
          light ? "bg-white border-gray-200" : "bg-gray-800 border-gray-700"
        }`}
      >
        <button
          onClick={() => requestLeave("gallery")} disabled={busy}
          className={`${subtleButtonClass} text-sm px-2 py-1 rounded transition-colors`}
        >
          ← {t.backToGallery}
        </button>
        <div className={`w-px h-4 ${light ? "bg-gray-200" : "bg-gray-600"}`} />
        <div className="flex min-w-40 items-center gap-2 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={renameDraft} disabled={busy}
              onChange={(e) => setRenameDraft(sanitizeSketchName(e.target.value))}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingName(false);
              }}
              className={`px-2 py-1 rounded text-sm w-48 outline-none border border-blue-500 ${
                light ? "bg-white text-gray-950" : "bg-gray-700 text-white"
              }`}
            />
          ) : (
            <button
              className={`min-w-0 max-w-64 truncate text-sm px-1 ${light ? "text-gray-700 hover:text-black" : "text-gray-300 hover:text-white"}`}
              onClick={startRename} disabled={busy || !loaded}
              title={t.clickToRename}
            >
              {displayName}
            </button>
          )}
          <span role="status" className={`shrink-0 whitespace-nowrap text-xs ${dirty ? "text-amber-500" : "text-green-600"}`}>{!loaded ? w.loading : busy ? w.saving : dirty ? w.unsaved : w.saved}</span>
        </div>
        <label className="text-xs flex items-center gap-1">
          p5.js
          <select aria-label={w.version} value={p5Version} disabled={busy || !loaded}
            onChange={(e) => setP5Version(e.target.value)}
            className={`border rounded px-2 py-1.5 ${light ? "bg-white border-gray-300" : "bg-gray-700 border-gray-500"}`}>
            {!getRuntime(p5Version) && <option value={p5Version}>{p5Version} ({w.unavailable})</option>}
            {RUNTIMES.map((runtime) => <option key={runtime.version} value={runtime.version}>{runtime.version}</option>)}
          </select>
        </label>
        <button disabled={busy || !loaded} className={`${subtleButtonClass} px-2 py-1.5 text-sm rounded`} onClick={() => setShowResources((v) => !v)}>{w.resources}</button>
        <button disabled={busy || !loaded} className={`${subtleButtonClass} px-2 py-1.5 text-sm rounded`} onClick={exportProject}>{w.exportProject}</button>
        <button
          onClick={() => setShowNotes((v) => !v)}
          className={`text-sm px-3 py-1.5 rounded transition-colors ${
            showNotes
              ? light
                ? "bg-gray-200 text-gray-950"
                : "bg-gray-600 text-white"
              : subtleButtonClass
          }`}
        >
          {notes ? `📝 ${t.notes}` : t.notes}
        </button>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} language={language} />
        {serialSupported && <div ref={toolsRef} className="relative shrink-0">
          <button type="button" aria-expanded={showTools} onClick={() => setShowTools((value) => !value)}
            className={`${subtleButtonClass} px-2 py-1.5 text-sm rounded`}>
            {st.more}{serial.session && <span aria-label={st.connected} className="ml-1 text-green-500">●</span>}
          </button>
          {showTools && <div className={`absolute right-0 top-full z-30 min-w-32 border rounded p-1 shadow-lg ${light ? "bg-white border-gray-200" : "bg-gray-800 border-gray-600"}`}>
            <button type="button" disabled={!loaded || busy} className={`${subtleButtonClass} block w-full px-3 py-2 text-left rounded`}
              onClick={() => { setSerialEnabled(true); setSerialOpenTrigger((value) => value + 1); setShowTools(false); }}>ESP32</button>
          </div>}
        </div>}
        <button
          onClick={() => adjustFontSize(-1)}
          className={`${subtleButtonClass} px-2 py-1.5 rounded text-sm transition-colors`}
          title={t.decreaseFont}
        >
          A-
        </button>
        <span className={`text-xs tabular-nums w-9 text-center ${light ? "text-gray-500" : "text-gray-500"}`}>
          {fontSize}px
        </span>
        <button
          onClick={() => adjustFontSize(1)}
          className={`${subtleButtonClass} px-2 py-1.5 rounded text-sm transition-colors`}
          title={t.increaseFont}
        >
          A+
        </button>
        <button
          onClick={formatActiveFile}
          className={`${subtleButtonClass} px-3 py-1.5 rounded text-sm transition-colors`}
          title={t.formatTitle}
        >
          {t.format}
        </button>
        {formatMsg && <span className="text-gray-500 text-xs max-w-48 truncate">{formatMsg}</span>}
        <button
          onClick={() => void run().catch((e) => setOperationError(String(e)))} disabled={busy || !loaded}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
        >
          ▶ {t.run}
        </button>
        <button
          onClick={() => void save()} disabled={busy || !loaded}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
        >
          {t.save}
        </button>
      </div>

      {draftError && <p role="alert" className="text-red-500 text-sm px-4 py-1">{pc.draftFailed}{draftError}</p>}
      {draftBackedUp && dirty && <p role="status" className="text-xs opacity-70 px-4">{pc.draftSaved}</p>}
      {operationError && <p role="alert" className="text-red-500 text-sm px-4 py-2 whitespace-pre-wrap select-text">{operationError}</p>}
      {operationMessage && <p role="status" className="text-green-600 text-sm px-4 py-2 select-text">{operationMessage}</p>}
      {!getRuntime(p5Version) && <p className="text-amber-500 text-xs px-4 py-1">{w.missingVersion}</p>}
      {runningVersion && runningVersion !== p5Version && <p className="text-amber-500 text-xs px-4 py-1">{w.nextRun}</p>}
      {getRuntime(p5Version)?.major === 2 && <p className="text-xs opacity-70 px-4 py-1">{w.v2Hint}</p>}
      {showResources && <ProjectResources name={name} theme={theme} language={language} ensureSaved={save} onAssetsChanged={refreshAssets} onBusyChange={setResourceBusy} libraries={libraries} assets={assets} onLibrariesChange={setLibraries} codeFiles={files.map((file) => file.name)} disabled={operationBusy || !loaded} />}
      {/* File tabs */}
      <FileTabs
        files={files.map((f) => f.name)}
        activeFile={activeFile}
        onSwitch={setActiveFile}
        onAdd={handleAddFile}
        onRemove={handleRemoveFile}
        theme={theme}
        language={language}
        disabled={busy || !loaded}
      />

      {/* Notes panel (collapsible) */}
      {showNotes && (
        <div
          className={`px-4 py-2 border-b shrink-0 ${
            light ? "bg-white border-gray-200" : "bg-gray-800 border-gray-700"
          }`}
        >
          <textarea
            value={notes} disabled={busy || !loaded}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t.addNotesPlaceholder}
            rows={3}
            className={`w-full text-sm px-3 py-2 rounded resize-none outline-none placeholder-gray-500 border focus:border-blue-500 ${
              light
                ? "bg-gray-50 text-gray-900 border-gray-300"
                : "bg-gray-700 text-gray-200 border-gray-600"
            }`}
          />
        </div>
      )}

      {/* Editor + Preview */}
      <div ref={splitContainerRef} className="relative flex flex-1 overflow-hidden">
        <div
          className="min-w-0 shrink-0 overflow-hidden"
          style={{ width: `${editorWidthPercent}%` }}
          onScrollCapture={() => {
            const view = codeMirrorRef.current?.view;
            const session = fileSessions.current.get(activeFile);
            if (view && session) { session.top = view.scrollDOM.scrollTop; session.left = view.scrollDOM.scrollLeft; }
          }}
          onWheel={(event) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            adjustFontSize(event.deltaY < 0 ? 1 : -1);
          }}
        >
          <CodeMirror
            key={activeFile}
            ref={codeMirrorRef}
            initialState={fileSessions.current.has(activeFile) ? { json: fileSessions.current.get(activeFile)!.json, fields: { history: historyField } } : undefined}
            onUpdate={(update) => {
              fileSessions.current.set(activeFile, { json: update.state.toJSON({ history: historyField }), top: update.view.scrollDOM.scrollTop, left: update.view.scrollDOM.scrollLeft });
            }}
            onCreateEditor={(view) => {
              const session = fileSessions.current.get(activeFile);
              if (session) requestAnimationFrame(() => { if (view.dom.isConnected) { view.scrollDOM.scrollTop = session.top; view.scrollDOM.scrollLeft = session.left; view.focus(); } });
              if (pendingLocation.current?.file === activeFile) requestAnimationFrame(() => { if (pendingLocation.current) focusLocation(pendingLocation.current); });
            }}
            value={activeCode}
            readOnly={busy || !loaded}
            height="100%"
            theme={light ? "light" : oneDark}
            extensions={getRuntime(p5Version)?.major === 1 ? [javascript(), p5LintExtension, p5CompletionExtension, keymapExt] : [javascript(), keymapExt]}
            onChange={updateCode}
            style={{ height: "100%", fontSize: `${fontSize}px` }}
            basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true }}
          />
        </div>
        <button
          type="button"
          role="separator"
          aria-label={t.resizeEditorPreview}
          aria-orientation="vertical"
          aria-valuemin={MIN_EDITOR_WIDTH_PERCENT}
          aria-valuemax={MAX_EDITOR_WIDTH_PERCENT}
          aria-valuenow={Math.round(editorWidthPercent)}
          onPointerDown={startResize}
          onDoubleClick={() => setEditorWidthPercent(DEFAULT_EDITOR_WIDTH_PERCENT)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              adjustEditorWidth(-2);
            }
            if (event.key === "ArrowRight") {
              event.preventDefault();
              adjustEditorWidth(2);
            }
            if (event.key === "Home") {
              event.preventDefault();
              setEditorWidthPercent(MIN_EDITOR_WIDTH_PERCENT);
            }
            if (event.key === "End") {
              event.preventDefault();
              setEditorWidthPercent(MAX_EDITOR_WIDTH_PERCENT);
            }
          }}
          className={`group relative z-20 w-2 shrink-0 cursor-col-resize outline-none transition-colors focus-visible:bg-blue-500/20 ${
            light ? "bg-gray-100 hover:bg-gray-200" : "bg-gray-800 hover:bg-gray-700"
          }`}
          title={t.resizeEditorPreview}
        >
          <span
            className={`absolute left-1/2 top-0 h-full w-px -translate-x-1/2 transition-colors ${
              isResizing
                ? "bg-blue-500"
                : light
                  ? "bg-gray-300 group-hover:bg-gray-400"
                  : "bg-gray-600 group-hover:bg-gray-500"
            }`}
          />
        </button>
        <div
          className={`min-w-0 shrink-0 ${light ? "bg-gray-100" : "bg-black"}`}
          style={{ width: `${100 - editorWidthPercent}%` }}
        >
          <Preview
            serial={serial}
            serialEnabled={serialEnabled && serialSupported}
            serialOpenTrigger={serialOpenTrigger}
            serialProject={persistedName}
            sourceFiles={files}
            onLocate={jumpToLocation}
            code={combinedCode}
            assets={assets}
            libraries={libraries}
            runTrigger={runTrigger}
            p5Version={p5Version}
            onThumbnail={handleThumbnail}
            debugMessages={debugMessages}
            onDebugMessage={appendDebugMessage}
            onClearDebug={() => setDebugMessages([])}
            theme={theme}
            language={language}
          />
        </div>
        {isResizing && <div className="fixed inset-0 z-50 cursor-col-resize" />}
      </div>
      {(draftCandidate || draftUnreadable) && <WorkflowDialog title={pc.draftFound} theme={theme}>
        <p>{pc.draftHint}</p>
        {draftCandidate && <p className="my-2 text-sm">{new Date(draftCandidate.updatedAt).toLocaleString()}</p>}
        {draftCandidate && draftCandidate.base !== savedSnapshot && <p role="alert" className="text-amber-500">{pc.conflict}</p>}
        <div className="flex gap-3 mt-4">
          <button disabled={!draftCandidate} className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50" onClick={() => {
            if (!draftCandidate) return;
            const recovered = draftCandidate.content;
            setName(recovered.name); setFiles(recovered.files); setActiveFile(recovered.files[0].name);
            setNotes(recovered.notes); setLibraries(recovered.libraries); setP5Version(recovered.p5Version);
            fileSessions.current.clear(); setDraftCandidate(null); setDraftUnreadable(false); setDraftError("");
          }}>{pc.restore}</button>
          <button className="border rounded px-3 py-2" onClick={() => {
            try { clearDraft(persistedName); setDraftCandidate(null); setDraftUnreadable(false); setDraftError(""); }
            catch (error) { setDraftError(String(error)); }
          }}>{pc.discard}</button>
        </div>
      </WorkflowDialog>}
      {leaveAction && <WorkflowDialog title={w.closeTitle} theme={theme}>
        <p>{w.closeHint}</p>
        <div className="flex justify-end gap-4 mt-5">
          <button disabled={busy} onClick={() => setLeaveAction(null)}>{w.cancel}</button>
          <button disabled={busy} onClick={() => {
            try { clearDraft(persistedName); } catch (error) { setDraftError(String(error)); return; }
            const action = leaveAction; setLeaveAction(null);
            void leaveEditor(action);
          }}>{w.discard}</button>
          <button disabled={busy} className="bg-blue-600 text-white rounded px-3 py-2" onClick={async () => {
            if (!await save()) return;
            const action = leaveAction; setLeaveAction(null);
            await leaveEditor(action);
          }}>{w.saveLeave}</button>
        </div>
      </WorkflowDialog>}
    </div>
  );
}
