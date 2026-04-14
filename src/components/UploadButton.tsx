import { open } from "@tauri-apps/plugin-dialog";
import { tauriApi } from "../lib/tauri";

interface UploadButtonProps {
  onUploaded: (name: string) => void;
}

export default function UploadButton({ onUploaded }: UploadButtonProps) {
  const handleClick = async () => {
    const selected = await open({
      filters: [{ name: "JavaScript", extensions: ["js"] }],
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return;

    const filename = selected.split("/").pop() ?? selected.split("\\").pop() ?? "sketch";
    const name = filename.replace(/\.js$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_");

    await tauriApi.importSketch(selected, name);
    onUploaded(name);
  };

  return (
    <button
      onClick={handleClick}
      className="bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
    >
      Upload .js
    </button>
  );
}
