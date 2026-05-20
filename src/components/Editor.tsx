import { useState, useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
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
  const stored = Number(localStorage.getItem(EDITOR_PREVIEW_SPLIT_KEY));
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
  const [savedMsg, setSavedMsg] = useState(false);
  const [formatMsg, setFormatMsg] = useState<string | null>(null);
  const [debugMessages, setDebugMessages] = useState<DebugMessage[]>([]);
  const [editorWidthPercent, setEditorWidthPercent] = useState(readStoredEditorWidthPercent);
  const [isResizing, setIsResizing] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    const stored = Number(localStorage.getItem(EDITOR_FONT_SIZE_KEY));
    return Number.isFinite(stored)
      ? clampEditorFontSize(stored)
      : DEFAULT_EDITOR_FONT_SIZE;
  });
  const { addSketch, sketches } = useSketchStore();
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const pendingThumbnail = useRef<string | null>(null);
  const light = isLightTheme(theme);
  const t = text[language];
  const subtleButtonClass = light
    ? "text-gray-600 hover:text-gray-950 hover:bg-gray-100"
    : "text-gray-400 hover:text-white hover:bg-gray-700";

  // Load sketch on mount
  useEffect(() => {
    if (initialName) {
      tauriApi.getSketch(initialName).then((data) => {
        setFiles(data.files.length > 0 ? data.files : [{ name: "sketch.js", code: "" }]);
        setActiveFile(data.files[0]?.name ?? "sketch.js");
        setNotes(data.notes);
        setLibraries(data.libraries ?? []);
      });
      tauriApi.getSketchAssets(initialName).then(setAssets);
    }
  }, [initialName]);

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

  const combinedCode = files.map((f) => f.code).join("\n");

  const save = useCallback(async () => {
    // Ensure sketch folder exists
    if (!sketches.includes(name)) {
      await tauriApi.createSketch(name);
      addSketch(name);
    }
    // Save each file
    for (const f of files) {
      await tauriApi.saveSketchFile(name, f.name, f.code);
    }
    // Save notes
    await tauriApi.saveNotes(name, notes);
    // Preserve per-sketch library declarations from meta.json.
    await tauriApi.saveLibraries(name, libraries);
    // Save pending thumbnail if any
    if (pendingThumbnail.current) {
      await tauriApi.saveThumbnail(name, pendingThumbnail.current);
      pendingThumbnail.current = null;
    }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }, [name, files, notes, libraries, sketches, addSketch]);

  const run = useCallback(async () => {
    await save();

    const diagnostics = getJavaScriptDiagnostics(combinedCode);
    const staticMessages: DebugMessage[] = diagnostics.map((diagnostic) => ({
      level: diagnostic.level === "error" ? "error" : "warn",
      message: diagnostic.message,
      line: diagnostic.line,
      column: diagnostic.column,
      timestamp: Date.now(),
    }));
    setDebugMessages(staticMessages);

    const syntaxError = await checkJavaScriptSyntax(combinedCode);
    if (syntaxError) {
      setDebugMessages([{
        level: "error",
        message: `SyntaxError: ${syntaxError.message}`,
        line: syntaxError.line,
        column: syntaxError.column,
        timestamp: Date.now(),
      }]);
      return;
    }

    try {
      setAssets(await tauriApi.getSketchAssets(name));
    } catch {
      setAssets({});
    }
    setRunTrigger((t) => t + 1);
  }, [combinedCode, name, save]);

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
    if (initialName) {
      await tauriApi.addSketchFile(initialName, fileName);
    }
    setFiles((prev) => [...prev, { name: fileName, code: `// ${fileName}\n` }]);
    setActiveFile(fileName);
  }, [files, initialName]);

  const handleRemoveFile = useCallback(async (fileName: string) => {
    if (initialName) {
      await tauriApi.removeSketchFile(initialName, fileName);
    }
    setFiles((prev) => {
      const next = prev.filter((f) => f.name !== fileName);
      if (activeFile === fileName) setActiveFile(next[0]?.name ?? "");
      return next;
    });
  }, [activeFile, initialName]);

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
        className={`flex items-center gap-3 px-4 py-2 border-b shrink-0 ${
          light ? "bg-white border-gray-200" : "bg-gray-800 border-gray-700"
        }`}
      >
        <button
          onClick={onBack}
          className={`${subtleButtonClass} text-sm px-2 py-1 rounded transition-colors`}
        >
          ← {t.backToGallery}
        </button>
        <div className={`w-px h-4 ${light ? "bg-gray-200" : "bg-gray-600"}`} />
        <div className="flex items-center gap-2 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={renameDraft}
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
              className={`text-sm px-1 ${light ? "text-gray-700 hover:text-black" : "text-gray-300 hover:text-white"}`}
              onClick={startRename}
              title={t.clickToRename}
            >
              {displayName}
            </button>
          )}
          {savedMsg && <span className="text-green-400 text-xs">{t.saved}</span>}
        </div>
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
          onClick={run}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
        >
          ▶ {t.run}
        </button>
        <button
          onClick={save}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
        >
          {t.save}
        </button>
      </div>

      {/* File tabs */}
      <FileTabs
        files={files.map((f) => f.name)}
        activeFile={activeFile}
        onSwitch={setActiveFile}
        onAdd={handleAddFile}
        onRemove={handleRemoveFile}
        theme={theme}
        language={language}
      />

      {/* Notes panel (collapsible) */}
      {showNotes && (
        <div
          className={`px-4 py-2 border-b shrink-0 ${
            light ? "bg-white border-gray-200" : "bg-gray-800 border-gray-700"
          }`}
        >
          <textarea
            value={notes}
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
          onWheel={(event) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            adjustFontSize(event.deltaY < 0 ? 1 : -1);
          }}
        >
          <CodeMirror
            key={activeFile}
            value={activeCode}
            height="100%"
            theme={light ? "light" : oneDark}
            extensions={[javascript(), p5LintExtension, p5CompletionExtension, keymapExt]}
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
            code={combinedCode}
            assets={assets}
            libraries={libraries}
            runTrigger={runTrigger}
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
    </div>
  );
}
