import { ColorTheme, isLightTheme } from "../lib/theme";

interface ThemeToggleProps {
  theme: ColorTheme;
  onToggle: () => void;
}

export default function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const light = isLightTheme(theme);

  return (
    <button
      onClick={onToggle}
      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
        light
          ? "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          : "bg-gray-700 text-gray-200 border border-gray-600 hover:bg-gray-600 hover:text-white"
      }`}
      title="Toggle light and dark mode"
    >
      {light ? "Light" : "Dark"}
    </button>
  );
}
