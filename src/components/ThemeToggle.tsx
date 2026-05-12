import { Language, text } from "../lib/language";
import { ColorTheme, isLightTheme } from "../lib/theme";

interface ThemeToggleProps {
  theme: ColorTheme;
  onToggle: () => void;
  language: Language;
}

export default function ThemeToggle({ theme, onToggle, language }: ThemeToggleProps) {
  const light = isLightTheme(theme);
  const t = text[language];

  return (
    <button
      onClick={onToggle}
      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
        light
          ? "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          : "bg-gray-700 text-gray-200 border border-gray-600 hover:bg-gray-600 hover:text-white"
      }`}
      title={t.toggleTheme}
    >
      {light ? t.light : t.dark}
    </button>
  );
}
