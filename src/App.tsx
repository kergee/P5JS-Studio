import { lazy, Suspense, useEffect, useState } from "react";
import Gallery from "./components/Gallery";
import { Language, LANGUAGE_KEY, readStoredLanguage, text } from "./lib/language";
import { ColorTheme, isLightTheme, readStoredTheme, THEME_KEY } from "./lib/theme";

const Editor = lazy(() => import("./components/Editor"));

type View = { type: "gallery" } | { type: "editor"; name?: string };

function parentPath(path?: string) {
  if (!path) return "";
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export default function App() {
  const [view, setView] = useState<View>({ type: "gallery" });
  const [galleryPath, setGalleryPath] = useState("");
  const [theme, setTheme] = useState<ColorTheme>(readStoredTheme);
  const [language, setLanguage] = useState<Language>(readStoredLanguage);

  const openEditor = (name?: string) => {
    if (name) setGalleryPath(parentPath(name));
    setView({ type: "editor", name });
  };
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
      <Suspense
        fallback={
          <div
            className={`flex h-screen w-screen items-center justify-center text-sm ${
              isLightTheme(theme) ? "bg-gray-50 text-gray-500" : "bg-gray-900 text-gray-400"
            }`}
          >
            {text[language].loadingEditor}
          </div>
        }
      >
        <Editor
          initialName={view.name}
          onBack={openGallery}
          theme={theme}
          onToggleTheme={toggleTheme}
          language={language}
        />
      </Suspense>
    );
  }

  return (
    <Gallery
      onOpen={openEditor}
      theme={theme}
      onToggleTheme={toggleTheme}
      language={language}
      onLanguageChange={setLanguage}
      currentPath={galleryPath}
      onPathChange={setGalleryPath}
    />
  );
}
