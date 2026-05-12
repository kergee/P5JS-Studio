import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { DirectoryListing, tauriApi } from "../lib/tauri";
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

const emptyListing: DirectoryListing = { folders: [], sketches: [] };

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

function parentPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function sanitizeName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, "").trim();
}

function pathLabel(path: string) {
  return path || "Home";
}

export default function Gallery({ onOpen, theme, onToggleTheme }: GalleryProps) {
  const { setSketches, addSketch, removeSketch } = useSketchStore();
  const [currentPath, setCurrentPath] = useState("");
  const [listing, setListing] = useState<DirectoryListing>(emptyListing);
  const [moveTargets, setMoveTargets] = useState<string[]>([]);
  const [movingSketch, setMovingSketch] = useState<string | null>(null);
  const [moveDestination, setMoveDestination] = useState("");
  const light = isLightTheme(theme);
  const subtleButtonClass = light
    ? "text-gray-600 hover:text-gray-950 hover:bg-gray-100"
    : "text-gray-400 hover:text-white hover:bg-gray-700";

  const refresh = useCallback(async () => {
    const [nextListing, allSketches] = await Promise.all([
      tauriApi.listDirectory(currentPath),
      tauriApi.listSketches(),
    ]);
    setListing(nextListing);
    setSketches(allSketches);
  }, [currentPath, setSketches]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 拖拽 .js 文件到窗口，导入到当前目录
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    getCurrentWebviewWindow()
      .onDragDropEvent(async (event) => {
        if (event.payload.type !== "drop") return;
        const paths: string[] = (event.payload as { type: string; paths: string[] }).paths;
        for (const path of paths) {
          if (!path.endsWith(".js")) continue;
          const filename = path.split(/[\\/]/).pop() ?? "sketch";
          const name = sanitizeName(filename.replace(/\.js$/i, "")) || "sketch";
          const sketchPath = joinPath(currentPath, name);
          await tauriApi.importSketch(path, sketchPath);
          addSketch(sketchPath);
        }
        refresh();
      })
      .then((unlisten) => { cleanup = unlisten; });
    return () => cleanup?.();
  }, [addSketch, currentPath, refresh]);

  const handleDelete = async (name: string) => {
    const sketchPath = joinPath(currentPath, name);
    await tauriApi.deleteSketch(sketchPath);
    removeSketch(sketchPath);
    refresh();
  };

  const handleUploaded = (name: string) => {
    addSketch(name);
    refresh();
    onOpen(name);
  };

  const handleOpenFolder = () => tauriApi.openSketchesDir();

  const handleNewFolder = async () => {
    const raw = prompt("New folder name");
    if (!raw) return;
    const name = sanitizeName(raw);
    if (!name) return;
    await tauriApi.createFolder(currentPath, name);
    refresh();
  };

  const handleRenameFolder = async (folderName: string) => {
    const raw = prompt("Rename folder", folderName);
    if (!raw) return;
    const name = sanitizeName(raw);
    if (!name || name === folderName) return;
    const renamed = await tauriApi.renameFolder(joinPath(currentPath, folderName), name);
    if (currentPath === joinPath(parentPath(joinPath(currentPath, folderName)), folderName)) {
      setCurrentPath(renamed);
    }
    refresh();
  };

  const handleDeleteFolder = async (folderName: string) => {
    if (!confirm(`Delete empty folder "${folderName}"?`)) return;
    await tauriApi.deleteFolder(joinPath(currentPath, folderName));
    refresh();
  };

  const handleNewSketch = () => {
    const raw = prompt("New sketch name", "untitled");
    if (!raw) return;
    const name = sanitizeName(raw) || "untitled";
    onOpen(joinPath(currentPath, name));
  };

  const handleExport = async () => {
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
    await tauriApi.importSketchesZip(selected);
    refresh();
  };

  const openMoveDialog = async (name: string) => {
    const sketchPath = joinPath(currentPath, name);
    const folders = await tauriApi.listFolders();
    setMoveTargets(folders);
    setMoveDestination(parentPath(sketchPath));
    setMovingSketch(sketchPath);
  };

  const confirmMove = async () => {
    if (!movingSketch) return;
    await tauriApi.moveSketch(movingSketch, moveDestination);
    setMovingSketch(null);
    refresh();
  };

  const breadcrumbParts = currentPath.split("/").filter(Boolean);
  const hasItems = listing.folders.length > 0 || listing.sketches.length > 0;

  return (
    <div className={`flex flex-col h-screen ${light ? "bg-gray-50" : "bg-gray-900"}`}>
      <div
        className={`flex items-center justify-between gap-4 px-6 py-4 border-b shrink-0 ${
          light ? "bg-white border-gray-200" : "border-gray-700"
        }`}
      >
        <div className="min-w-0">
          <h1 className={`text-lg font-bold ${light ? "text-gray-950" : "text-white"}`}>
            P5JS Studio
          </h1>
          <div className="flex items-center gap-1 mt-1 text-xs">
            <button
              onClick={() => setCurrentPath("")}
              className={`${subtleButtonClass} px-1.5 py-0.5 rounded transition-colors`}
            >
              Home
            </button>
            {breadcrumbParts.map((part, index) => {
              const path = breadcrumbParts.slice(0, index + 1).join("/");
              return (
                <span key={path} className="flex items-center gap-1">
                  <span className={light ? "text-gray-300" : "text-gray-600"}>/</span>
                  <button
                    onClick={() => setCurrentPath(path)}
                    className={`${subtleButtonClass} px-1.5 py-0.5 rounded transition-colors`}
                  >
                    {part}
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenFolder}
            title="在 Finder 中打开存储目录"
            className={`${subtleButtonClass} px-3 py-2 rounded text-sm transition-colors`}
          >
            📁 Open Folder
          </button>
          <button
            onClick={handleNewFolder}
            className={`${subtleButtonClass} px-3 py-2 rounded text-sm transition-colors`}
          >
            New Folder
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
            title="将所有草图导出为 ZIP"
            className={`${subtleButtonClass} px-3 py-2 rounded text-sm transition-colors`}
          >
            ↓ Export ZIP
          </button>

          <div className={`w-px h-5 mx-1 ${light ? "bg-gray-200" : "bg-gray-600"}`} />

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <UploadButton onUploaded={handleUploaded} theme={theme} folderPath={currentPath} />
          <button
            onClick={handleNewSketch}
            className="bg-green-600 hover:bg-green-500 active:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            + New Sketch
          </button>
        </div>
      </div>

      {hasItems ? (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {listing.folders.map((name) => (
              <div
                key={`folder:${name}`}
                className={`rounded-lg overflow-hidden border transition-colors group ${
                  light
                    ? "bg-white border-gray-200 hover:border-gray-400 shadow-sm"
                    : "bg-gray-800 border-gray-700 hover:border-gray-500"
                }`}
              >
                <button
                  onClick={() => setCurrentPath(joinPath(currentPath, name))}
                  className={`h-32 w-full flex items-center justify-center ${
                    light ? "bg-amber-50 text-amber-700" : "bg-amber-950 text-amber-300"
                  }`}
                >
                  <span className="text-5xl">📁</span>
                </button>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => setCurrentPath(joinPath(currentPath, name))}
                      className={`text-sm truncate font-medium text-left ${
                        light ? "text-gray-800 hover:text-black" : "text-gray-200 hover:text-white"
                      }`}
                      title={name}
                    >
                      {name}
                    </button>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => handleRenameFolder(name)}
                        className={`${subtleButtonClass} text-xs px-2 py-0.5 rounded transition-colors`}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDeleteFolder(name)}
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
                </div>
              </div>
            ))}

            {listing.sketches.map((name) => (
              <SketchCard
                key={`sketch:${name}`}
                name={name}
                onOpen={() => onOpen(joinPath(currentPath, name))}
                onDelete={() => handleDelete(name)}
                onMove={() => openMoveDialog(name)}
                theme={theme}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={`flex-1 flex items-center justify-center ${light ? "text-gray-500" : "text-gray-500"}`}>
          <div className="text-center">
            <div className="text-6xl mb-4 opacity-30">{"{ }"}</div>
            <p className="text-base font-medium">No sketches here</p>
            <p className={`text-sm mt-2 ${light ? "text-gray-500" : "text-gray-600"}`}>
              Create a sketch, create a folder,
              <br />
              upload a .js file, or import a ZIP
            </p>
          </div>
        </div>
      )}

      {movingSketch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className={`w-96 rounded-lg p-4 shadow-xl ${light ? "bg-white" : "bg-gray-800"}`}>
            <h2 className={`text-sm font-semibold ${light ? "text-gray-950" : "text-white"}`}>
              Move {movingSketch.split("/").pop()}
            </h2>
            <select
              value={moveDestination}
              onChange={(e) => setMoveDestination(e.target.value)}
              className={`mt-4 w-full rounded border px-3 py-2 text-sm outline-none ${
                light ? "bg-white border-gray-300 text-gray-900" : "bg-gray-700 border-gray-600 text-white"
              }`}
            >
              {moveTargets.map((path) => (
                <option key={path || "root"} value={path}>
                  {pathLabel(path)}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setMovingSketch(null)}
                className={`${subtleButtonClass} px-3 py-1.5 rounded text-sm transition-colors`}
              >
                Cancel
              </button>
              <button
                onClick={confirmMove}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition-colors"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
