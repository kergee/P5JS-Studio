import { invoke } from "@tauri-apps/api/core";

export interface SketchFile {
  name: string;
  code: string;
}

export interface SketchData {
  files: SketchFile[];
  notes: string;
  libraries: string[];
  p5Version: string;
  thumbnail: string | null;
}

export interface SketchOverview {
  notes: string;
  thumbnail: string | null;
}

export interface DirectoryListing {
  folders: string[];
  sketches: string[];
}

export type SketchAssets = Record<string, string>;
export interface AssetEntry { path: string; size: number }
export interface ProjectSave {
  originalName: string | null;
  name: string;
  files: SketchFile[];
  notes: string;
  libraries: string[];
  p5Version: string;
}

export const tauriApi = {
  saveProject: (project: ProjectSave) => invoke<void>("save_project", { project }),
  listProjectAssets: (name: string) => invoke<AssetEntry[]>("list_project_assets", { name }),
  addProjectAssets: (name: string, paths: string[], folder: string, overwrite: boolean) =>
    invoke<string[]>("add_project_assets", { name, paths, folder, overwrite }),
  removeProjectAsset: (name: string, path: string) => invoke<void>("remove_project_asset", { name, path }),
  exportProject: (name: string, destPath: string) => invoke<void>("export_project", { name, destPath }),
  exportFolder: (path: string, destPath: string) => invoke<void>("export_folder", { path, destPath }),
  importProjectZip: (zipPath: string, targetFolder: string, skipExisting: boolean) =>
    invoke<string | null>("import_project_zip", { zipPath, targetFolder, skipExisting }),
  importJsProject: (path: string, targetFolder: string) => invoke<string>("import_js_project", { path, targetFolder }),
  restoreBackup: (zipPath: string) => invoke<{ imported: string[]; backupPath: string }>("restore_backup", { zipPath }),
  listSketches: () => invoke<string[]>("list_sketches"),
  listDirectory: (path: string) => invoke<DirectoryListing>("list_directory", { path }),
  listFolders: () => invoke<string[]>("list_folders"),
  getSketch: (name: string) => invoke<SketchData>("get_sketch", { name }),
  getDirectoryOverview: (path: string) =>
    invoke<Record<string, SketchOverview>>("get_directory_overview", { path }),
  getSketchAssets: (name: string) => invoke<SketchAssets>("get_sketch_assets", { name }),

  createSketch: (name: string, p5Version?: string) => invoke<void>("create_sketch", { name, p5Version }),
  createFolder: (parentPath: string, name: string) =>
    invoke<string>("create_folder", { parentPath, name }),
  renameFolder: (path: string, newName: string) =>
    invoke<string>("rename_folder", { path, newName }),
  deleteFolder: (path: string) => invoke<void>("delete_folder", { path }),
  moveSketch: (sketchPath: string, destFolder: string) =>
    invoke<string>("move_sketch", { sketchPath, destFolder }),
  duplicateSketch: (sketchPath: string) =>
    invoke<string>("duplicate_sketch", { sketchPath }),
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
