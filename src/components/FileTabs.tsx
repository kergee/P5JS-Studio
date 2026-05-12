import { useState } from "react";
import { ColorTheme, isLightTheme } from "../lib/theme";

interface FileTabsProps {
  files: string[];
  activeFile: string;
  onSwitch: (name: string) => void;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  theme: ColorTheme;
}

export default function FileTabs({
  files,
  activeFile,
  onSwitch,
  onAdd,
  onRemove,
  theme,
}: FileTabsProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const light = isLightTheme(theme);

  const confirmAdd = () => {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    const fileName = name.endsWith(".js") ? name : `${name}.js`;
    onAdd(fileName);
    setNewName("");
    setAdding(false);
  };

  return (
    <div
      className={`flex items-center gap-0.5 px-3 py-1.5 border-b overflow-x-auto shrink-0 ${
        light ? "bg-gray-100 border-gray-200" : "border-gray-700"
      }`}
      style={light ? undefined : { background: "#1a1f2e" }}
    >
      {files.map((f) => (
        <div
          key={f}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-t text-xs cursor-pointer select-none group transition-colors
            ${activeFile === f
              ? light
                ? "bg-white text-gray-900 border border-gray-200 border-b-white"
                : "bg-gray-700 text-white"
              : light
                ? "text-gray-500 hover:text-gray-900 hover:bg-white"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-750"
            }`}
          style={activeFile !== f ? { background: "transparent" } : undefined}
          onClick={() => onSwitch(f)}
        >
          <span>{f}</span>
          {files.length > 1 && (
            <button
              className={`opacity-0 group-hover:opacity-100 transition-opacity leading-none ${
                light ? "text-gray-400 hover:text-red-600" : "text-gray-500 hover:text-red-400"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Remove "${f}" from this sketch?`)) onRemove(f);
              }}
              title="Remove file"
            >
              ×
            </button>
          )}
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-1 ml-1">
          <input
            autoFocus
            value={newName}
            placeholder="filename.js"
            onChange={(e) => setNewName(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
              if (e.key === "Escape") { setAdding(false); setNewName(""); }
            }}
            onBlur={confirmAdd}
            className={`text-xs px-2 py-1 rounded w-28 outline-none border border-blue-500 ${
              light ? "bg-white text-gray-900" : "bg-gray-700 text-white"
            }`}
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className={`ml-1 text-xs px-2 py-1 rounded transition-colors ${
            light
              ? "text-gray-500 hover:text-gray-900 hover:bg-white"
              : "text-gray-500 hover:text-gray-300 hover:bg-gray-700"
          }`}
          title="Add file"
        >
          + Add File
        </button>
      )}
    </div>
  );
}
