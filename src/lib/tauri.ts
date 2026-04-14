import { invoke } from "@tauri-apps/api/core";

export const tauriApi = {
  listSketches: () => invoke<string[]>("list_sketches"),

  saveSketch: (name: string, code: string) =>
    invoke<void>("save_sketch", { name, code }),

  readSketch: (name: string) => invoke<string>("read_sketch", { name }),

  deleteSketch: (name: string) => invoke<void>("delete_sketch", { name }),

  importSketch: (path: string, name: string) =>
    invoke<void>("import_sketch", { path, name }),
};
