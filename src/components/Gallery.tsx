import { useCallback, useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Language, text } from "../lib/language";
import { DirectoryListing, tauriApi } from "../lib/tauri";
import { ColorTheme, isLightTheme } from "../lib/theme";
import { APP_VERSION } from "../lib/version";
import { useSketchStore } from "../store/useSketchStore";
import SketchCard from "./SketchCard";
import ThemeToggle from "./ThemeToggle";
import UploadButton from "./UploadButton";

interface GalleryProps {
  onOpen: (name?: string) => void;
  theme: ColorTheme;
  onToggleTheme: () => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  currentPath: string;
  onPathChange: (path: string) => void;
}

const emptyListing: DirectoryListing = { folders: [], sketches: [] };

type PendingDelete =
  | { type: "sketch"; name: string }
  | { type: "folder"; name: string }
  | null;

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

function pathLabel(path: string, homeLabel: string) {
  return path || homeLabel;
}

export default function Gallery({
  onOpen,
  theme,
  onToggleTheme,
  language,
  onLanguageChange,
  currentPath,
  onPathChange,
}: GalleryProps) {
  const { setSketches, addSketch, removeSketch } = useSketchStore();
  const [listing, setListing] = useState<DirectoryListing>(emptyListing);
  const [showHelp, setShowHelp] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [moveTargets, setMoveTargets] = useState<string[]>([]);
  const [movingSketch, setMovingSketch] = useState<string | null>(null);
  const [moveDestination, setMoveDestination] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [folderNotes, setFolderNotes] = useState("");
  const [folderNotesLoadedPath, setFolderNotesLoadedPath] = useState<string | null>(null);
  const light = isLightTheme(theme);
  const t = text[language];
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

  useEffect(() => {
    let cancelled = false;
    setFolderNotesLoadedPath(null);
    setFolderNotes("");
    tauriApi
      .getFolderNotes(currentPath)
      .then((notes) => {
        if (cancelled) return;
        setFolderNotes(notes);
        setFolderNotesLoadedPath(currentPath);
      })
      .catch(() => {
        if (cancelled) return;
        setFolderNotes("");
        setFolderNotesLoadedPath(currentPath);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  useEffect(() => {
    if (folderNotesLoadedPath !== currentPath) return;
    const timer = window.setTimeout(() => {
      void tauriApi.saveFolderNotes(currentPath, folderNotes);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [currentPath, folderNotes, folderNotesLoadedPath]);

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
    const raw = prompt(t.newFolderPrompt);
    if (!raw) return;
    const name = sanitizeName(raw);
    if (!name) return;
    await tauriApi.createFolder(currentPath, name);
    refresh();
  };

  const handleRenameFolder = async (folderName: string) => {
    const raw = prompt(t.renameFolderPrompt, folderName);
    if (!raw) return;
    const name = sanitizeName(raw);
    if (!name || name === folderName) return;
    const renamed = await tauriApi.renameFolder(joinPath(currentPath, folderName), name);
    if (currentPath === joinPath(parentPath(joinPath(currentPath, folderName)), folderName)) {
      onPathChange(renamed);
    }
    refresh();
  };

  const handleDeleteFolder = async (name: string) => {
    await tauriApi.deleteFolder(joinPath(currentPath, name));
    refresh();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      if (pendingDelete.type === "sketch") {
        await handleDelete(pendingDelete.name);
      } else {
        await handleDeleteFolder(pendingDelete.name);
      }
      setPendingDelete(null);
    } catch {
      setDeleteError(
        pendingDelete.type === "sketch" ? t.deleteSketchFailed : t.deleteFolderFailed
      );
    }
  };

  const handleNewSketch = () => {
    const raw = prompt(t.newSketchPrompt, "untitled");
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
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowLanguageMenu((value) => !value)}
                className={`${subtleButtonClass} px-1.5 py-0.5 rounded transition-colors`}
              >
                {t.language}
              </button>
              {showLanguageMenu && (
                <div
                  className={`absolute left-0 top-6 z-20 min-w-28 rounded border p-1 shadow-lg ${
                    light ? "bg-white border-gray-200" : "bg-gray-800 border-gray-700"
                  }`}
                >
                  <button
                    onClick={() => {
                      onLanguageChange("en");
                      setShowLanguageMenu(false);
                    }}
                    className={`block w-full rounded px-2 py-1 text-left transition-colors ${
                      language === "en"
                        ? light
                          ? "bg-gray-100 text-gray-950"
                          : "bg-gray-700 text-white"
                        : subtleButtonClass
                    }`}
                  >
                    {t.english}
                  </button>
                  <button
                    onClick={() => {
                      onLanguageChange("zh-CN");
                      setShowLanguageMenu(false);
                    }}
                    className={`block w-full rounded px-2 py-1 text-left transition-colors ${
                      language === "zh-CN"
                        ? light
                          ? "bg-gray-100 text-gray-950"
                          : "bg-gray-700 text-white"
                        : subtleButtonClass
                    }`}
                  >
                    {t.chinese}
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowHelp(true)}
              className={`${subtleButtonClass} px-1.5 py-0.5 rounded transition-colors`}
            >
              {t.help}
            </button>
            <span className={`px-1.5 py-0.5 ${light ? "text-gray-400" : "text-gray-500"}`}>
              v{APP_VERSION}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1 text-xs">
            <button
              onClick={() => onPathChange("")}
              className={`${subtleButtonClass} px-1.5 py-0.5 rounded transition-colors`}
            >
              {t.home}
            </button>
            {breadcrumbParts.map((part, index) => {
              const path = breadcrumbParts.slice(0, index + 1).join("/");
              return (
                <span key={path} className="flex items-center gap-1">
                  <span className={light ? "text-gray-300" : "text-gray-600"}>/</span>
                  <button
                    onClick={() => onPathChange(path)}
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
            title={t.openFolderTitle}
            className={`${subtleButtonClass} px-3 py-2 rounded text-sm transition-colors`}
          >
            📁 {t.openFolder}
          </button>
          <button
            onClick={handleNewFolder}
            className={`${subtleButtonClass} px-3 py-2 rounded text-sm transition-colors`}
          >
            {t.newFolder}
          </button>
          <button
            onClick={handleImportZip}
            title={t.importZipTitle}
            className={`${subtleButtonClass} px-3 py-2 rounded text-sm transition-colors`}
          >
            ↑ {t.importZip}
          </button>
          <button
            onClick={handleExport}
            title={t.exportZipTitle}
            className={`${subtleButtonClass} px-3 py-2 rounded text-sm transition-colors`}
          >
            ↓ {t.exportZip}
          </button>

          <div className={`w-px h-5 mx-1 ${light ? "bg-gray-200" : "bg-gray-600"}`} />

          <ThemeToggle theme={theme} onToggle={onToggleTheme} language={language} />
          <UploadButton
            onUploaded={handleUploaded}
            theme={theme}
            folderPath={currentPath}
            language={language}
          />
          <button
            onClick={handleNewSketch}
            className="bg-green-600 hover:bg-green-500 active:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            + {t.newSketch}
          </button>
        </div>
      </div>

      {hasItems ? (
        <div className="flex-1 overflow-auto p-6">
          <section className="mb-5">
            <label
              className={`mb-2 block text-xs font-medium ${light ? "text-gray-600" : "text-gray-400"}`}
            >
              {t.folderNotes}
            </label>
            <textarea
              value={folderNotes}
              onChange={(event) => setFolderNotes(event.target.value)}
              placeholder={t.addFolderNotesPlaceholder}
              rows={3}
              className={`w-full resize-y rounded border px-3 py-2 text-sm outline-none transition-colors ${
                light
                  ? "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-400"
                  : "border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
              }`}
            />
          </section>
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
                  onClick={() => onPathChange(joinPath(currentPath, name))}
                  className={`h-32 w-full flex items-center justify-center ${
                    light ? "bg-amber-50 text-amber-700" : "bg-amber-950 text-amber-300"
                  }`}
                >
                  <span className="text-5xl">📁</span>
                </button>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => onPathChange(joinPath(currentPath, name))}
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
                        {t.renameFolder}
                      </button>
                      <button
                        onClick={() => setPendingDelete({ type: "folder", name })}
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

            {listing.sketches.map((name) => {
              const sketchPath = joinPath(currentPath, name);
              return (
                <SketchCard
                  key={`sketch:${sketchPath}`}
                  name={name}
                  sketchPath={sketchPath}
                  onOpen={() => onOpen(sketchPath)}
                  onDelete={() => setPendingDelete({ type: "sketch", name })}
                  onMove={() => openMoveDialog(name)}
                  theme={theme}
                  language={language}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <section className="mb-10">
            <label
              className={`mb-2 block text-xs font-medium ${light ? "text-gray-600" : "text-gray-400"}`}
            >
              {t.folderNotes}
            </label>
            <textarea
              value={folderNotes}
              onChange={(event) => setFolderNotes(event.target.value)}
              placeholder={t.addFolderNotesPlaceholder}
              rows={3}
              className={`w-full resize-y rounded border px-3 py-2 text-sm outline-none transition-colors ${
                light
                  ? "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-blue-400"
                  : "border-gray-700 bg-gray-800 text-gray-100 placeholder:text-gray-500 focus:border-blue-500"
              }`}
            />
          </section>
          <div className={`flex min-h-80 items-center justify-center ${light ? "text-gray-500" : "text-gray-500"}`}>
            <div className="text-center">
              <div className="text-6xl mb-4 opacity-30">{"{ }"}</div>
              <p className="text-base font-medium">{t.noSketchesHere}</p>
              <p className={`text-sm mt-2 ${light ? "text-gray-500" : "text-gray-600"}`}>
                {t.emptyHint.split("\n").map((line, index) => (
                  <span key={line}>
                    {line}
                    {index === 0 && <br />}
                  </span>
                ))}
              </p>
            </div>
          </div>
        </div>
      )}

      {movingSketch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className={`w-96 rounded-lg p-4 shadow-xl ${light ? "bg-white" : "bg-gray-800"}`}>
            <h2 className={`text-sm font-semibold ${light ? "text-gray-950" : "text-white"}`}>
              {t.moveSketch(movingSketch.split("/").pop() ?? "")}
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
                  {pathLabel(path, t.home)}
                </option>
              ))}
            </select>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setMovingSketch(null)}
                className={`${subtleButtonClass} px-3 py-1.5 rounded text-sm transition-colors`}
              >
                {t.cancel}
              </button>
              <button
                onClick={confirmMove}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition-colors"
              >
                {t.move}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className={`w-full max-w-sm rounded-lg p-4 shadow-xl ${light ? "bg-white" : "bg-gray-800"}`}>
            <h2 className={`text-sm font-semibold ${light ? "text-gray-950" : "text-white"}`}>
              {pendingDelete.type === "sketch" ? t.deleteSketch : t.deleteEmptyFolder}
            </h2>
            <p className={`mt-3 text-sm ${light ? "text-gray-600" : "text-gray-300"}`}>
              {pendingDelete.type === "sketch"
                ? t.deleteSketchConfirm(pendingDelete.name)
                : t.deleteEmptyFolderConfirm(pendingDelete.name)}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className={`${subtleButtonClass} px-3 py-1.5 rounded text-sm transition-colors`}
              >
                {t.cancel}
              </button>
              <button
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-sm transition-colors"
              >
                {pendingDelete.type === "sketch" ? t.deleteSketch : t.deleteEmptyFolder}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteError && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className={`w-full max-w-sm rounded-lg p-4 shadow-xl ${light ? "bg-white" : "bg-gray-800"}`}>
            <h2 className={`text-sm font-semibold ${light ? "text-gray-950" : "text-white"}`}>
              {t.deleteFailed}
            </h2>
            <p className={`mt-3 text-sm ${light ? "text-gray-600" : "text-gray-300"}`}>
              {deleteError}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setDeleteError(null)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div
            className={`w-full max-w-2xl rounded-lg shadow-xl border ${
              light ? "bg-white border-gray-200" : "bg-gray-800 border-gray-700"
            }`}
          >
            <div
              className={`flex items-center justify-between px-5 py-4 border-b ${
                light ? "border-gray-200" : "border-gray-700"
              }`}
            >
              <h2 className={`text-base font-semibold ${light ? "text-gray-950" : "text-white"}`}>
                {t.helpTitle}
              </h2>
              <button
                onClick={() => setShowHelp(false)}
                className={`h-7 w-7 rounded text-sm transition-colors ${
                  light
                    ? "text-gray-500 hover:text-gray-950 hover:bg-gray-100"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
                title={t.closeHelp}
              >
                x
              </button>
            </div>

            <div className={`px-5 py-4 text-sm space-y-4 ${light ? "text-gray-700" : "text-gray-300"}`}>
              <section>
                <h3 className={`font-medium mb-1 ${light ? "text-gray-950" : "text-white"}`}>
                  {t.helpGalleryTitle}
                </h3>
                <p>
                  {t.helpGallery.split("meta.json")[0]}
                  <code className="font-mono">meta.json</code>
                  {t.helpGallery.split("meta.json")[1]}
                </p>
              </section>

              <section>
                <h3 className={`font-medium mb-1 ${light ? "text-gray-950" : "text-white"}`}>
                  {t.helpEditorTitle}
                </h3>
                <p>{t.helpEditor}</p>
              </section>

              <section>
                <h3 className={`font-medium mb-1 ${light ? "text-gray-950" : "text-white"}`}>
                  {t.helpAssetsTitle}
                </h3>
                <p>
                  {t.helpAssets.split("images/pic1.png")[0]}
                  <code className="font-mono">images/pic1.png</code>
                  {t.helpAssets.split("images/pic1.png")[1]}
                </p>
              </section>

              <section>
                <h3 className={`font-medium mb-1 ${light ? "text-gray-950" : "text-white"}`}>
                  {t.helpDebugTitle}
                </h3>
                <p>
                  {t.helpDebug.split("console.log")[0]}
                  <code className="font-mono">console.log</code>
                  {t.helpDebug.split("console.log")[1]}
                </p>
              </section>

              <section>
                <h3 className={`font-medium mb-1 ${light ? "text-gray-950" : "text-white"}`}>
                  {t.helpPreviewTitle}
                </h3>
                <p>
                  {t.helpPreview}
                </p>
              </section>

              <section>
                <h3 className={`font-medium mb-1 ${light ? "text-gray-950" : "text-white"}`}>
                  {t.helpShortcutsTitle}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  <p><code className="font-mono">Ctrl+Enter</code> {t.shortcutRun}</p>
                  <p><code className="font-mono">Ctrl+S</code> {t.shortcutSave}</p>
                  <p><code className="font-mono">Ctrl+wheel</code> {t.shortcutFont}</p>
                  <p><code className="font-mono">Shift+Alt+F</code> {t.shortcutFormat}</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
