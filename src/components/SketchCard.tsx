import { Language, text } from "../lib/language";
import { ColorTheme, isLightTheme } from "../lib/theme";

interface SketchCardProps {
  name: string;
  sketchPath: string;
  notes: string;
  thumbnail: string | null;
  onOpen: () => void;
  onDelete: () => void;
  onMove: () => void;
  onDuplicate: () => void;
  theme: ColorTheme;
  language: Language;
}

export default function SketchCard({
  name,
  notes,
  thumbnail,
  onOpen,
  onDelete,
  onMove,
  onDuplicate,
  theme,
  language,
}: SketchCardProps) {
  const light = isLightTheme(theme);
  const t = text[language];

  return (
    <div
      className={`rounded-lg overflow-hidden border transition-colors group cursor-pointer ${
        light
          ? "bg-white border-gray-200 hover:border-gray-400 shadow-sm"
          : "bg-gray-800 border-gray-700 hover:border-gray-500"
      }`}
    >
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
          <div
            className={`w-full h-full flex items-center justify-center ${
              light
                ? "bg-gradient-to-br from-sky-100 via-indigo-100 to-rose-100"
                : "bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-800"
            }`}
          >
            <span className={`text-3xl opacity-40 font-mono ${light ? "text-gray-700" : "text-white"}`}>
              {"{ }"}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-sm truncate font-medium ${
              light ? "text-gray-800 hover:text-black" : "text-gray-200 hover:text-white"
            }`}
            onClick={onOpen}
            title={name}
          >
            {name}
          </span>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={onOpen}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                light
                  ? "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  : "text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
            >
              {t.edit}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMove();
              }}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                light
                  ? "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  : "text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
            >
              {t.move}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                light
                  ? "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  : "text-gray-400 hover:text-white hover:bg-gray-700"
              }`}
            >
              {t.duplicate}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                light
                  ? "text-gray-400 hover:text-red-600 hover:bg-red-50"
                  : "text-gray-500 hover:text-red-400 hover:bg-gray-700"
              }`}
            >
              ✕
            </button>
          </div>
        </div>
        {notes && (
          <p className={`text-xs mt-1 truncate ${light ? "text-gray-500" : "text-gray-500"}`} title={notes}>
            {notes}
          </p>
        )}
      </div>
    </div>
  );
}
