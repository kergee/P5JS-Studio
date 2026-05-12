import { useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { tauriApi } from "../lib/tauri";
import { ColorTheme, isLightTheme } from "../lib/theme";
import { useSketchStore } from "../store/useSketchStore";
import SketchCard from "./SketchCard";
import ThemeToggle from "./ThemeToggle";
import UploadButton from "./UploadButton";

interface GalleryProps {
  onOpen: (name?: string) => void;
  theme: ColorTheme;
  onToggleTheme: () => void;
}

export default function Gallery({ onOpen, theme, onToggleTheme }: GalleryProps) {
  const { sketches, setSketches, addSketch, removeSketch } = useSketchStore();
  const light = isLightTheme(theme);
  const subtleButtonClass = light
    ? "text-gray-600 hover:text-gray-950 hover:bg-gray-100"
    : "text-gray-400 hover:text-white hover:bg-gray-700";

  useEffect(() => {
    tauriApi.listSketches().then(setSketches);
  }, [setSketches]);

  // 拖拽 .js 文件到窗口
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
      .then((unlisten) => { cleanup = unlisten; });
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

  const handleOpenFolder = () => tauriApi.openSketchesDir();

  const handleExport = async () => {
    if (sketches.length === 0) return;
    const dest = await save({
      defaultPath: "p5js-sketches.zip",
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!dest) return;
    await tauriApi.exportSketches(dest);
  };

  const handleImportZip = async () => {
    const selected = await open({
      filters: [{ name: "ZIP", extensions: ["zip"] }],
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;
    const imported = await tauriApi.importSketchesZip(selected);
    if (imported.length > 0) {
      // 重新拉取列表保证顺序一致
      const all = await tauriApi.listSketches();
      setSketches(all);
    }
  };

  return (
    <div className={`flex flex-col h-screen ${light ? "bg-gray-50" : "bg-gray-900"}`}>
      {/* Header */}
      <div
        className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
          light ? "bg-white border-gray-200" : "border-gray-700"
        }`}
      >
        <div>
          <h1 className={`text-lg font-bold ${light ? "text-gray-950" : "text-white"}`}>
            P5JS Studio
          </h1>
          <p className={`text-xs mt-0.5 ${light ? "text-gray-500" : "text-gray-500"}`}>
            {sketches.length} sketch{sketches.length !== 1 ? "es" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 管理操作 */}
          <button
            onClick={handleOpenFolder}
            title="在 Finder 中打开存储目录"
            className={`${subtleButtonClass} px-3 py-2 rounded text-sm transition-colors`}
          >
            📁 Open Folder
          </button>
          <button
            onClick={handleImportZip}
            title="从 ZIP 导入草图"
            className={`${subtleButtonClass} px-3 py-2 rounded text-sm transition-colors`}
          >
            ↑ Import ZIP
          </button>
          <button
            onClick={handleExport}
            disabled={sketches.length === 0}
            title="将所有草图导出为 ZIP"
            className={`${subtleButtonClass} disabled:opacity-30 disabled:cursor-not-allowed px-3 py-2 rounded text-sm transition-colors`}
          >
            ↓ Export ZIP
          </button>

          <div className={`w-px h-5 mx-1 ${light ? "bg-gray-200" : "bg-gray-600"}`} />

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <UploadButton onUploaded={handleUploaded} theme={theme} />
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
        <div className={`flex-1 flex items-center justify-center ${light ? "text-gray-500" : "text-gray-500"}`}>
          <div className="text-center">
            <div className="text-6xl mb-4 opacity-30">{"{ }"}</div>
            <p className="text-base font-medium">No sketches yet</p>
            <p className={`text-sm mt-2 ${light ? "text-gray-500" : "text-gray-600"}`}>
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
                theme={theme}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
