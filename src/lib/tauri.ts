import { invoke } from "@tauri-apps/api/core";

export interface SketchFile {
  name: string;
  code: string;
}

export interface SketchData {
  files: SketchFile[];
  notes: string;
  libraries: string[];
  thumbnail: string | null;
}

export interface SketchSummary {
  notes: string;
  has_thumbnail: boolean;
}

export interface DirectoryListing {
  folders: string[];
  sketches: string[];
}

export type SketchAssets = Record<string, string>;

export const tauriApi = {
  listSketches: () => invoke<string[]>("list_sketches"),
  listDirectory: (path: string) => invoke<DirectoryListing>("list_directory", { path }),
  listFolders: () => invoke<string[]>("list_folders"),
  getSketch: (name: string) => invoke<SketchData>("get_sketch", { name }),
  getSketchSummary: (name: string) => invoke<SketchSummary>("get_sketch_summary", { name }),
  getThumbnail: (name: string) => invoke<string | null>("get_thumbnail", { name }),
  getSketchAssets: (name: string) => invoke<SketchAssets>("get_sketch_assets", { name }),

  createSketch: (name: string) => invoke<void>("create_sketch", { name }),
  createFolder: (parentPath: string, name: string) =>
    invoke<string>("create_folder", { parentPath, name }),
  renameFolder: (path: string, newName: string) =>
    invoke<string>("rename_folder", { path, newName }),
  deleteFolder: (path: string) => invoke<void>("delete_folder", { path }),
  moveSketch: (sketchPath: string, destFolder: string) =>
    invoke<string>("move_sketch", { sketchPath, destFolder }),
  saveSketchFile: (sketchName: string, fileName: string, code: string) =>
    invoke<void>("save_sketch_file", { sketchName, fileName, code }),
  addSketchFile: (sketchName: string, fileName: string) =>
    invoke<void>("add_sketch_file", { sketchName, fileName }),
  removeSketchFile: (sketchName: string, fileName: string) =>
    invoke<void>("remove_sketch_file", { sketchName, fileName }),
  saveNotes: (sketchName: string, notes: string) =>
    invoke<void>("save_notes", { sketchName, notes }),
  getFolderNotes: (path: string) =>
    invoke<string>("get_folder_notes", { path }),
  saveFolderNotes: (path: string, notes: string) =>
    invoke<void>("save_folder_notes", { path, notes }),
  saveLibraries: (sketchName: string, libraries: string[]) =>
    invoke<void>("save_libraries", { sketchName, libraries }),
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
