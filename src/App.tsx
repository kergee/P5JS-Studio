import { useState } from "react";
import Gallery from "./components/Gallery";
import Editor from "./components/Editor";

type View = { type: "gallery" } | { type: "editor"; name?: string };

export default function App() {
  const [view, setView] = useState<View>({ type: "gallery" });

  const openEditor = (name?: string) => setView({ type: "editor", name });
  const openGallery = () => setView({ type: "gallery" });

  if (view.type === "editor") {
    return <Editor initialName={view.name} onBack={openGallery} />;
  }

  return <Gallery onOpen={openEditor} />;
}
