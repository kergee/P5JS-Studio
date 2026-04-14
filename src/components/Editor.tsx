import { useState, useCallback, useEffect, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import Preview from "./Preview";
import FileTabs from "./FileTabs";
import { tauriApi, SketchFile } from "../lib/tauri";
import { useSketchStore } from "../store/useSketchStore";

interface EditorProps {
  initialName?: string;
  onBack: () => void;
}

export default function Editor({ initialName, onBack }: EditorProps) {
  const [files, setFiles] = useState<SketchFile[]>([{ name: "sketch.js", code: "" }]);
  const [activeFile, setActiveFile] = useState("sketch.js");
  const [name, setName] = useState(initialName ?? "untitled");
  const [editingName, setEditingName] = useState(false);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [runTrigger, setRunTrigger] = useState(0);
  const [savedMsg, setSavedMsg] = useState(false);
  const { addSketch, sketches } = useSketchStore();
  const pendingThumbnail = useRef<string | null>(null);

  // Load sketch on mount
  useEffect(() => {
    if (initialName) {
      tauriApi.getSketch(initialName).then((data) => {
        setFiles(data.files.length > 0 ? data.files : [{ name: "sketch.js", code: "" }]);
        setActiveFile(data.files[0]?.name ?? "sketch.js");
        setNotes(data.notes);
      });
    }
  }, [initialName]);

  const activeCode = files.find((f) => f.name === activeFile)?.code ?? "";

  const updateCode = useCallback((code: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.name === activeFile ? { ...f, code } : f))
    );
  }, [activeFile]);

  const run = useCallback(() => setRunTrigger((t) => t + 1), []);

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
    // Save pending thumbnail if any
    if (pendingThumbnail.current) {
      await tauriApi.saveThumbnail(name, pendingThumbnail.current);
      pendingThumbnail.current = null;
    }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }, [name, files, notes, sketches, addSketch]);

  const handleThumbnail = useCallback((dataUrl: string) => {
    pendingThumbnail.current = dataUrl;
    // Auto-save thumbnail immediately if sketch already exists
    if (initialName) {
      tauriApi.saveThumbnail(initialName, dataUrl).catch(() => {});
    }
  }, [initialName]);

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

  const combinedCode = files.map((f) => f.code).join("\n");

  const keymapExt = keymap.of([
    { key: "Ctrl-Enter", mac: "Ctrl-Enter", run: () => { run(); return true; } },
    { key: "Ctrl-s", mac: "Cmd-s", run: () => { save(); return true; } },
  ]);

  return (
    <div className="flex flex-col h-screen bg-gray-900 select-none">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700 transition-colors"
        >
          ← Gallery
        </button>
        <div className="w-px h-4 bg-gray-600" />
        <div className="flex items-center gap-2 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm w-48 outline-none border border-blue-500"
            />
          ) : (
            <button
              className="text-gray-300 text-sm hover:text-white px-1"
              onClick={() => setEditingName(true)}
              title="Click to rename"
            >
              {name}
            </button>
          )}
          {savedMsg && <span className="text-green-400 text-xs">Saved</span>}
        </div>
        <button
          onClick={() => setShowNotes((v) => !v)}
          className={`text-sm px-3 py-1.5 rounded transition-colors ${
            showNotes ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-700"
          }`}
        >
          {notes ? "📝 Notes" : "Notes"}
        </button>
        <span className="text-gray-600 text-xs hidden sm:block">Ctrl+Enter · Ctrl+S</span>
        <button
          onClick={run}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
        >
          ▶ Run
        </button>
        <button
          onClick={save}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
        >
          Save
        </button>
      </div>

      {/* File tabs */}
      <FileTabs
        files={files.map((f) => f.name)}
        activeFile={activeFile}
        onSwitch={setActiveFile}
        onAdd={handleAddFile}
        onRemove={handleRemoveFile}
      />

      {/* Notes panel (collapsible) */}
      {showNotes && (
        <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes, description, or links for this sketch…"
            rows={3}
            className="w-full bg-gray-700 text-gray-200 text-sm px-3 py-2 rounded resize-none outline-none placeholder-gray-500 border border-gray-600 focus:border-blue-500"
          />
        </div>
      )}

      {/* Editor + Preview */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 overflow-hidden border-r border-gray-700">
          <CodeMirror
            key={activeFile}
            value={activeCode}
            height="100%"
            theme={oneDark}
            extensions={[javascript(), keymapExt]}
            onChange={updateCode}
            style={{ height: "100%", fontSize: "13px" }}
            basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: true }}
          />
        </div>
        <div className="w-1/2 bg-black">
          <Preview
            code={combinedCode}
            runTrigger={runTrigger}
            onThumbnail={handleThumbnail}
          />
        </div>
      </div>
    </div>
  );
}
