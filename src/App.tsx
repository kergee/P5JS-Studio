import { useEffect, useState } from "react";
import Gallery from "./components/Gallery";
import Editor from "./components/Editor";
import { Language, LANGUAGE_KEY, readStoredLanguage } from "./lib/language";
import { ColorTheme, readStoredTheme, THEME_KEY } from "./lib/theme";

type View = { type: "gallery" } | { type: "editor"; name?: string };

export default function App() {
  const [view, setView] = useState<View>({ type: "gallery" });
  const [theme, setTheme] = useState<ColorTheme>(readStoredTheme);
  const [language, setLanguage] = useState<Language>(readStoredLanguage);

  const openEditor = (name?: string) => setView({ type: "editor", name });
  const openGallery = () => setView({ type: "gallery" });
  const toggleTheme = () => setTheme((value) => (value === "dark" ? "light" : "dark"));

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language === "zh-CN" ? "zh-CN" : "en";
  }, [language]);

  if (view.type === "editor") {
    return (
      <Editor
        initialName={view.name}
        onBack={openGallery}
        theme={theme}
        onToggleTheme={toggleTheme}
        language={language}
      />
    );
  }

  return (
    <Gallery
      onOpen={openEditor}
      theme={theme}
      onToggleTheme={toggleTheme}
      language={language}
      onLanguageChange={setLanguage}
    />
  );
}
