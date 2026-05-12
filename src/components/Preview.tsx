import { useEffect, useRef } from "react";
import { buildSrcdoc } from "../lib/p5source";
import { ColorTheme, isLightTheme } from "../lib/theme";

interface PreviewProps {
  code: string;
  assets?: Record<string, string>;
  runTrigger: number;
  onThumbnail?: (dataUrl: string) => void;
  theme: ColorTheme;
}

export default function Preview({
  code,
  assets = {},
  runTrigger,
  onThumbnail,
  theme,
}: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const light = isLightTheme(theme);

  // Run sketch when triggered
  useEffect(() => {
    if (runTrigger === 0) return;
    if (iframeRef.current) {
      iframeRef.current.srcdoc = buildSrcdoc(code, assets);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runTrigger]);

  // Listen for thumbnail captured inside iframe via postMessage
  useEffect(() => {
    if (!onThumbnail) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "p5studio_thumbnail") {
        onThumbnail(e.data.data as string);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onThumbnail]);

  if (runTrigger === 0) {
    return (
      <div
        className={`w-full h-full flex items-center justify-center select-none ${
          light ? "bg-gray-100 text-gray-500" : "bg-gray-950 text-gray-600"
        }`}
      >
        <div className="text-center">
          <div className="text-3xl mb-3 opacity-40">▶</div>
          <p className="text-sm">Press Run or Ctrl+Enter</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      className="w-full h-full border-0"
      title="p5.js preview"
    />
  );
}
