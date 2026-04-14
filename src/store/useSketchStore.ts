import { create } from "zustand";

interface SketchStore {
  sketches: string[];
  setSketches: (sketches: string[]) => void;
  addSketch: (name: string) => void;
  removeSketch: (name: string) => void;
}

export const useSketchStore = create<SketchStore>((set) => ({
  sketches: [],
  setSketches: (sketches) => set({ sketches }),
  addSketch: (name) =>
    set((state) => ({
      sketches: [...state.sketches.filter((s) => s !== name), name].sort(),
    })),
  removeSketch: (name) =>
    set((state) => ({ sketches: state.sketches.filter((s) => s !== name) })),
}));
