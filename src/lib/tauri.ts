import { invoke } from "@tauri-apps/api/core";

export const tauriApi = {
  listSketches: () => invoke<string[]>("list_sketches"),
  saveSketch: (name: string, code: string) =>
    invoke<void>("save_sketch", { name, code }),
  readSketch: (name: string) => invoke<string>("read_sketch", { name }),
  deleteSketch: (name: string) => invoke<void>("delete_sketch", { name }),
  importSketch: (path: string, name: string) =>
    invoke<void>("import_sketch", { path, name }),

  openSketchesDir: () => invoke<void>("open_sketches_dir"),
  exportSketches: (destPath: string) =>
    invoke<void>("export_sketches", { destPath }),
  importSketchesZip: (zipPath: string) =>
    invoke<string[]>("import_sketches_zip", { zipPath }),
};
