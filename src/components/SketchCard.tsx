import { Language, text } from "../lib/language";
import { ColorTheme, isLightTheme } from "../lib/theme";

interface SketchCardProps {
  name: string;
  sketchPath: string;
  notes: string;
  thumbnail: string | null;
  rating: number;
  favorite: boolean;
  reviewBusy: boolean;
  showPath?: boolean;
  onRatingChange: (rating: number) => void;
  onFavoriteChange: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onMove: () => void;
  onDuplicate: () => void;
  theme: ColorTheme;
  language: Language;
}

export default function SketchCard({
  name,
  sketchPath,
  notes,
  thumbnail,
  rating,
  favorite,
  reviewBusy,
  showPath,
  onRatingChange,
  onFavoriteChange,
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
      <button
        type="button"
        aria-label={`${t.edit}: ${name}`}
        className="h-32 w-full flex items-center justify-center overflow-hidden"
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
      </button>

      {/* Info */}
      <div className="p-3">
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            className={`w-full text-left text-sm truncate font-medium ${
              light ? "text-gray-800 hover:text-black" : "text-gray-200 hover:text-white"
            }`}
            onClick={onOpen}
            title={name}
          >
            {name}
          </button>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0">
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
        {showPath && <p className={`mt-1 text-xs truncate ${light ? "text-gray-500" : "text-gray-400"}`} title={sketchPath}>{sketchPath}</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label={t.rating} className="flex items-center">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" disabled={reviewBusy}
                aria-label={t.rateStars(value)} aria-pressed={rating === value} title={t.rateStars(value)}
                onClick={() => onRatingChange(value)}
                className={`px-0.5 text-xl rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 ${value <= rating ? (light ? "text-amber-600" : "text-amber-400") : (light ? "text-gray-400 hover:text-amber-600" : "text-gray-500 hover:text-amber-400")}`}>
                {value <= rating ? "★" : "☆"}
              </button>
            ))}
            {rating > 0 ? <button type="button" disabled={reviewBusy} onClick={() => onRatingChange(0)}
              aria-label={t.clearRating} title={t.clearRating}
              className={`ml-1 px-1 text-xs ${light ? "text-gray-500 hover:text-gray-900" : "text-gray-400 hover:text-white"}`}>✕</button>
              : <span className={`ml-1 text-xs ${light ? "text-gray-500" : "text-gray-400"}`}>{t.unrated}</span>}
          </div>
          <button type="button" disabled={reviewBusy} aria-pressed={favorite}
            aria-label={favorite ? t.unfavorite : t.favorite} title={favorite ? t.unfavorite : t.favorite}
            onClick={onFavoriteChange}
            className={`rounded px-1 py-1 text-xs disabled:opacity-50 ${favorite ? (light ? "text-rose-700" : "text-rose-300") : (light ? "text-gray-600 hover:text-rose-700" : "text-gray-400 hover:text-rose-300")}`}>
            {favorite ? "♥" : "♡"} {favorite ? t.favorited : t.favorite}
          </button>
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
