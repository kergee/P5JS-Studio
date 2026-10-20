import type { SketchSummary } from "./tauri";

export interface GalleryFilters {
  query: string;
  favoritesOnly: boolean;
  rating: string; // all, unrated, or an exact 1–5 star rating
  scope: "all" | "folder";
  currentPath: string;
}

export function filterSketches(items: SketchSummary[], filters: GalleryFilters): SketchSummary[] {
  const words = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (filters.scope === "folder") {
      const parent = item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/")) : "";
      if (parent !== filters.currentPath) return false;
    }
    if (filters.favoritesOnly && !item.favorite) return false;
    if (filters.rating !== "all" && item.rating !== (filters.rating === "unrated" ? 0 : Number(filters.rating))) return false;
    const haystack = `${item.path}\n${item.notes}`.toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
