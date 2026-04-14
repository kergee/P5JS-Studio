import { useEffect, useState } from "react";
import { tauriApi } from "../lib/tauri";

interface SketchCardProps {
  name: string;
  onOpen: () => void;
  onDelete: () => void;
}

export default function SketchCard({ name, onOpen, onDelete }: SketchCardProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    tauriApi.getSketchSummary(name).then((s) => setNotes(s.notes));
    tauriApi.getThumbnail(name).then(setThumbnail);
  }, [name]);

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors group cursor-pointer">
      {/* Thumbnail */}
      <div
        className="h-32 flex items-center justify-center overflow-hidden"
        onClick={onOpen}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-800 flex items-center justify-center">
            <span className="text-3xl opacity-40 font-mono text-white">{"{ }"}</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-sm text-gray-200 truncate hover:text-white font-medium"
            onClick={onOpen}
            title={name}
          >
            {name}
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={onOpen}
              className="text-gray-400 hover:text-white text-xs px-2 py-0.5 rounded hover:bg-gray-700"
            >
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete "${name}"?`)) onDelete();
              }}
              className="text-gray-500 hover:text-red-400 text-xs px-2 py-0.5 rounded hover:bg-gray-700"
            >
              ✕
            </button>
          </div>
        </div>
        {notes && (
          <p className="text-xs text-gray-500 mt-1 truncate" title={notes}>
            {notes}
          </p>
        )}
      </div>
    </div>
  );
}
