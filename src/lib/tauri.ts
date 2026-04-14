import { invoke } from "@tauri-apps/api/core";

export interface SketchFile {
  name: string;
  code: string;
}

export interface SketchData {
  files: SketchFile[];
  notes: string;
  thumbnail: string | null;
}

export interface SketchSummary {
  notes: string;
  has_thumbnail: boolean;
}

export const tauriApi = {
  listSketches: () => invoke<string[]>("list_sketches"),
  getSketch: (name: string) => invoke<SketchData>("get_sketch", { name }),
  getSketchSummary: (name: string) => invoke<SketchSummary>("get_sketch_summary", { name }),
  getThumbnail: (name: string) => invoke<string | null>("get_thumbnail", { name }),

  createSketch: (name: string) => invoke<void>("create_sketch", { name }),
  saveSketchFile: (sketchName: string, fileName: string, code: string) =>
    invoke<void>("save_sketch_file", { sketchName, fileName, code }),
  addSketchFile: (sketchName: string, fileName: string) =>
    invoke<void>("add_sketch_file", { sketchName, fileName }),
  removeSketchFile: (sketchName: string, fileName: string) =>
    invoke<void>("remove_sketch_file", { sketchName, fileName }),
  saveNotes: (sketchName: string, notes: string) =>
    invoke<void>("save_notes", { sketchName, notes }),
  saveThumbnail: (sketchName: string, dataUrl: string) =>
    invoke<void>("save_thumbnail", { sketchName, dataUrl }),

  deleteSketch: (name: string) => invoke<void>("delete_sketch", { name }),
  importSketch: (path: string, name: string) =>
    invoke<void>("import_sketch", { path, name }),
  openSketchesDir: () => invoke<void>("open_sketches_dir"),
  exportSketches: (destPath: string) =>
    invoke<void>("export_sketches", { destPath }),
  importSketchesZip: (zipPath: string) =>
    invoke<string[]>("import_sketches_zip", { zipPath }),
};
