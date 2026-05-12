import { open } from "@tauri-apps/plugin-dialog";
import { ColorTheme, isLightTheme } from "../lib/theme";
import { tauriApi } from "../lib/tauri";

interface UploadButtonProps {
  onUploaded: (name: string) => void;
  theme: ColorTheme;
  folderPath: string;
}

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

export default function UploadButton({ onUploaded, theme, folderPath }: UploadButtonProps) {
  const light = isLightTheme(theme);

  const handleClick = async () => {
    const selected = await open({
      filters: [{ name: "JavaScript", extensions: ["js"] }],
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;

    const filename = selected.split(/[\\/]/).pop() ?? "sketch";
    const name = filename.replace(/\.js$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");

    const sketchPath = joinPath(folderPath, name);
    await tauriApi.importSketch(selected, sketchPath);
    onUploaded(sketchPath);
  };

  return (
    <button
      onClick={handleClick}
      className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
        light
          ? "bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-900"
          : "bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white"
      }`}
    >
      Upload .js
    </button>
  );
}
