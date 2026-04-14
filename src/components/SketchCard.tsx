interface SketchCardProps {
  name: string;
  onOpen: () => void;
  onDelete: () => void;
}

export default function SketchCard({ name, onOpen, onDelete }: SketchCardProps) {
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors group cursor-pointer">
      <div
        className="h-32 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-800 flex items-center justify-center"
        onClick={onOpen}
      >
        <span className="text-5xl opacity-60">{"{ }"}</span>
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <span
          className="text-sm text-gray-200 truncate hover:text-white flex-1"
          onClick={onOpen}
          title={`${name}.js`}
        >
          {name}.js
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onOpen}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700"
            title="Edit"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete "${name}.js"?`)) onDelete();
            }}
            className="text-gray-500 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-gray-700"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
