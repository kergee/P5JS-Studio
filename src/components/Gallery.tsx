import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { tauriApi } from "../lib/tauri";
import { useSketchStore } from "../store/useSketchStore";
import SketchCard from "./SketchCard";
import UploadButton from "./UploadButton";

interface GalleryProps {
  onOpen: (name?: string) => void;
}

export default function Gallery({ onOpen }: GalleryProps) {
  const { sketches, setSketches, addSketch, removeSketch } = useSketchStore();

  useEffect(() => {
    tauriApi.listSketches().then(setSketches);
  }, [setSketches]);

  // Handle drag-drop of .js files onto the window
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    getCurrentWebviewWindow()
      .onDragDropEvent(async (event) => {
        if (event.payload.type !== "drop") return;
        const paths: string[] = (event.payload as { type: string; paths: string[] }).paths;
        for (const path of paths) {
          if (!path.endsWith(".js")) continue;
          const filename = path.split("/").pop() ?? path.split("\\").pop() ?? "sketch";
          const name = filename.replace(/\.js$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");
          await tauriApi.importSketch(path, name);
          addSketch(name);
        }
      })
      .then((unlisten) => {
        cleanup = unlisten;
      });
    return () => cleanup?.();
  }, [addSketch]);

  const handleDelete = async (name: string) => {
    await tauriApi.deleteSketch(name);
    removeSketch(name);
  };

  const handleUploaded = (name: string) => {
    addSketch(name);
    onOpen(name);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-white">P5JS Studio</h1>
          <p className="text-xs text-gray-500 mt-0.5">{sketches.length} sketch{sketches.length !== 1 ? "es" : ""}</p>
        </div>
        <div className="flex gap-3">
          <UploadButton onUploaded={handleUploaded} />
          <button
            onClick={() => onOpen(undefined)}
            className="bg-green-600 hover:bg-green-500 active:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            + New Sketch
          </button>
        </div>
      </div>

      {/* Content */}
      {sketches.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-6xl mb-4 opacity-30">{"{ }"}</div>
            <p className="text-base font-medium">No sketches yet</p>
            <p className="text-sm mt-2 text-gray-600">
              Create a new sketch, upload a .js file,
              <br />
              or drag a .js file anywhere onto this window
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {sketches.map((name) => (
              <SketchCard
                key={name}
                name={name}
                onOpen={() => onOpen(name)}
                onDelete={() => handleDelete(name)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
