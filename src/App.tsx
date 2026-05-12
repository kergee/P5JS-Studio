import { useEffect, useState } from "react";
import Gallery from "./components/Gallery";
import Editor from "./components/Editor";
import { ColorTheme, readStoredTheme, THEME_KEY } from "./lib/theme";

type View = { type: "gallery" } | { type: "editor"; name?: string };

export default function App() {
  const [view, setView] = useState<View>({ type: "gallery" });
  const [theme, setTheme] = useState<ColorTheme>(readStoredTheme);

  const openEditor = (name?: string) => setView({ type: "editor", name });
  const openGallery = () => setView({ type: "gallery" });
  const toggleTheme = () => setTheme((value) => (value === "dark" ? "light" : "dark"));

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  if (view.type === "editor") {
    return (
      <Editor
        initialName={view.name}
        onBack={openGallery}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  return <Gallery onOpen={openEditor} theme={theme} onToggleTheme={toggleTheme} />;
}
