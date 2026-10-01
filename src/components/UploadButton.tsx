import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Language, text } from "../lib/language";
import { ColorTheme, isLightTheme } from "../lib/theme";
import { tauriApi } from "../lib/tauri";

interface UploadButtonProps {
  onUploaded: (name: string) => void;
  theme: ColorTheme;
  folderPath: string;
  language: Language;
  disabled?: boolean;
  onError: (message: string) => void;
}

export default function UploadButton({ onUploaded, theme, folderPath, language, disabled = false, onError }: UploadButtonProps) {
  const [busy, setBusy] = useState(false);
  const light = isLightTheme(theme);
  const t = text[language];

  const handleClick = async () => {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const selected = await open({ filters: [{ name: "JavaScript", extensions: ["js"] }], multiple: false });
      if (!selected || typeof selected !== "string") return;
      const sketchPath = await tauriApi.importJsProject(selected, folderPath);
      onUploaded(sketchPath);
    } catch (e) { onError(String(e)); } finally { setBusy(false); }
  };

  return (
    <button
      onClick={handleClick} disabled={busy || disabled}
      className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
        light
          ? "bg-gray-200 hover:bg-gray-300 active:bg-gray-400 text-gray-900"
          : "bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white"
      }`}
    >
      {t.uploadJs}
    </button>
  );
}
