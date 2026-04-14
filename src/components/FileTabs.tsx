import { useState } from "react";

interface FileTabsProps {
  files: string[];
  activeFile: string;
  onSwitch: (name: string) => void;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}

export default function FileTabs({ files, activeFile, onSwitch, onAdd, onRemove }: FileTabsProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const confirmAdd = () => {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    const fileName = name.endsWith(".js") ? name : `${name}.js`;
    onAdd(fileName);
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 bg-gray-850 border-b border-gray-700 overflow-x-auto shrink-0"
      style={{ background: "#1a1f2e" }}>
      {files.map((f) => (
        <div
          key={f}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-t text-xs cursor-pointer select-none group transition-colors
            ${activeFile === f
              ? "bg-gray-700 text-white"
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-750"
            }`}
          style={activeFile !== f ? { background: "transparent" } : undefined}
          onClick={() => onSwitch(f)}
        >
          <span>{f}</span>
          {files.length > 1 && (
            <button
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-opacity leading-none"
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
            className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-28 outline-none border border-blue-500"
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="ml-1 text-gray-500 hover:text-gray-300 text-xs px-2 py-1 rounded hover:bg-gray-700 transition-colors"
          title="Add file"
        >
          + Add File
        </button>
      )}
    </div>
  );
}
