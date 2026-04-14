import { useState, useCallback, useEffect } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { keymap } from "@codemirror/view";
import Preview from "./Preview";
import { tauriApi } from "../lib/tauri";
import { useSketchStore } from "../store/useSketchStore";

const TEMPLATE = `function setup() {
  createCanvas(windowWidth, windowHeight);
  background(30, 30, 60);
}

function draw() {
  fill(100, 200, 255, 80);
  noStroke();
  ellipse(mouseX, mouseY, 60, 60);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
`;

interface EditorProps {
  initialName?: string;
  onBack: () => void;
}

export default function Editor({ initialName, onBack }: EditorProps) {
  const [code, setCode] = useState(TEMPLATE);
  const [name, setName] = useState(initialName ?? "untitled");
  const [editingName, setEditingName] = useState(false);
  const [runTrigger, setRunTrigger] = useState(0);
  const [savedMsg, setSavedMsg] = useState(false);
  const { addSketch, sketches } = useSketchStore();

  useEffect(() => {
    if (initialName) {
      tauriApi.readSketch(initialName).then(setCode);
    }
  }, [initialName]);

  const run = useCallback(() => setRunTrigger((t) => t + 1), []);

  const save = useCallback(async () => {
    await tauriApi.saveSketch(name, code);
    if (!sketches.includes(name)) addSketch(name);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }, [name, code, sketches, addSketch]);

  const keymapExt = keymap.of([
    {
      key: "Ctrl-Enter",
      mac: "Ctrl-Enter",
      run: () => {
        run();
        return true;
      },
    },
    {
      key: "Ctrl-s",
      mac: "Cmd-s",
      run: () => {
        save();
        return true;
      },
    },
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
              {name}.js
            </button>
          )}
          {savedMsg && (
            <span className="text-green-400 text-xs">Saved</span>
          )}
        </div>

        <span className="text-gray-500 text-xs hidden sm:block">
          Ctrl+Enter to run · Ctrl+S to save
        </span>

        <button
          onClick={run}
          className="bg-green-600 hover:bg-green-500 active:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
        >
          ▶ Run
        </button>
        <button
          onClick={save}
          className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
        >
          Save
        </button>
      </div>

      {/* Editor + Preview split */}
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 overflow-hidden flex flex-col border-r border-gray-700">
          <CodeMirror
            value={code}
            height="100%"
            theme={oneDark}
            extensions={[javascript(), keymapExt]}
            onChange={setCode}
            style={{ height: "100%", fontSize: "13px" }}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              autocompletion: true,
              highlightActiveLine: true,
            }}
          />
        </div>
        <div className="w-1/2 bg-black">
          <Preview code={code} runTrigger={runTrigger} />
        </div>
      </div>
    </div>
  );
}
