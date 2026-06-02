import { useCallback, useEffect, useRef, useState } from "react";
import { buildSrcdoc } from "../lib/p5source";
import { DebugMessage } from "../lib/debug";
import { Language, text } from "../lib/language";
import { ColorTheme, isLightTheme } from "../lib/theme";

const MIN_PREVIEW_SCALE = 0.1;
const MAX_PREVIEW_SCALE = 2;
const PREVIEW_SCALE_STEP = 0.1;

function clampPreviewScale(scale: number) {
  return Math.min(MAX_PREVIEW_SCALE, Math.max(MIN_PREVIEW_SCALE, scale));
}

interface PreviewProps {
  code: string;
  assets?: Record<string, string>;
  libraries?: string[];
  runTrigger: number;
  onThumbnail?: (dataUrl: string) => void;
  debugMessages: DebugMessage[];
  onDebugMessage?: (message: DebugMessage) => void;
  onRunStart?: () => void;
  onClearDebug?: () => void;
  theme: ColorTheme;
  language: Language;
}

export default function Preview({
  code,
  assets = {},
  libraries = [],
  runTrigger,
  onThumbnail,
  debugMessages,
  onDebugMessage,
  onRunStart,
  onClearDebug,
  theme,
  language,
}: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  const light = isLightTheme(theme);
  const t = text[language];

  const sendPreviewScale = useCallback((scale: number) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "p5studio_preview_scale", scale },
      "*"
    );
  }, []);

  const adjustPreviewScale = useCallback((delta: number) => {
    setPreviewScale((scale) => clampPreviewScale(Number((scale + delta).toFixed(2))));
  }, []);

  useEffect(() => {
    sendPreviewScale(previewScale);
  }, [previewScale, sendPreviewScale]);

  // Run sketch when triggered
  useEffect(() => {
    if (runTrigger === 0) return;
    onRunStart?.();
    if (iframeRef.current) {
      iframeRef.current.srcdoc = buildSrcdoc(code, assets, libraries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runTrigger]);

  // Listen for thumbnail and debug messages captured inside iframe via postMessage
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "p5studio_thumbnail") {
        onThumbnail?.(e.data.data as string);
      }
      if (e.data?.type === "p5studio_debug") {
        onDebugMessage?.({
          level: e.data.level === "warn" || e.data.level === "error" ? e.data.level : "log",
          message: String(e.data.message ?? ""),
          line: typeof e.data.line === "number" ? e.data.line : undefined,
          column: typeof e.data.column === "number" ? e.data.column : undefined,
          timestamp: Date.now(),
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onThumbnail, onDebugMessage]);

  const consoleClass = light
    ? "bg-white border-gray-200 text-gray-700"
    : "bg-gray-900 border-gray-700 text-gray-300";

  const previewToolbarClass = light
    ? "bg-white/95 border-gray-200 text-gray-700 shadow-sm"
    : "bg-gray-900/95 border-gray-700 text-gray-300 shadow-lg";

  const previewButtonClass = light
    ? "hover:bg-gray-100 text-gray-600 hover:text-gray-950"
    : "hover:bg-gray-800 text-gray-400 hover:text-white";

  const debugSummary = (() => {
    if (debugMessages.length === 0) return t.noLogs;
    const level = debugMessages.some((message) => message.level === "error")
      ? t.debugLevelError
      : debugMessages.some((message) => message.level === "warn")
        ? t.debugLevelWarning
        : t.debugLevelLog;
    return `${debugMessages.length} ${t.debugLogs} · ${level}`;
  })();

  const renderPreviewToolbar = () => (
    <div
      className={`absolute right-3 top-3 z-10 flex items-center gap-1 rounded border px-1.5 py-1 text-xs ${previewToolbarClass}`}
    >
      <button
        onClick={() => adjustPreviewScale(-PREVIEW_SCALE_STEP)}
        className={`h-6 w-6 rounded ${previewButtonClass}`}
        title={t.zoomOutPreview}
      >
        -
      </button>
      <button
        onClick={() => setPreviewScale(1)}
        className={`h-6 min-w-12 rounded px-2 tabular-nums ${previewButtonClass}`}
        title={t.resetPreviewZoom}
      >
        {Math.round(previewScale * 100)}%
      </button>
      <button
        onClick={() => adjustPreviewScale(PREVIEW_SCALE_STEP)}
        className={`h-6 w-6 rounded ${previewButtonClass}`}
        title={t.zoomInPreview}
      >
        +
      </button>
    </div>
  );

  const renderDebugConsole = () => (
    <div className={`${debugCollapsed ? "h-9" : "h-36"} border-t text-xs flex flex-col ${consoleClass}`}>
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-b ${
          light ? "border-gray-200" : "border-gray-700"
        }`}
      >
        <button
          type="button"
          onClick={() => setDebugCollapsed((value) => !value)}
          className={`min-w-0 flex-1 rounded px-1 py-0.5 text-left transition-colors ${
            light
              ? "text-gray-600 hover:bg-gray-100 hover:text-gray-950"
              : "text-gray-400 hover:bg-gray-800 hover:text-white"
          }`}
          title={debugCollapsed ? t.showDebugConsole : t.hideDebugConsole}
        >
          <span className="font-medium">{t.debugConsole}</span>
          <span className={light ? "ml-2 text-gray-400" : "ml-2 text-gray-500"}>
            {debugSummary}
          </span>
          <span className={light ? "ml-2 text-gray-400" : "ml-2 text-gray-500"}>
            {debugCollapsed ? t.showDebugConsole : t.hideDebugConsole}
          </span>
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onClearDebug?.();
          }}
          className={`px-2 py-0.5 rounded transition-colors ${
            light
              ? "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              : "text-gray-500 hover:text-white hover:bg-gray-800"
          }`}
        >
          {t.clear}
        </button>
      </div>
      {!debugCollapsed && (
        <div className="flex-1 overflow-auto px-3 py-2 font-mono whitespace-pre-wrap">
          {debugMessages.length === 0 ? (
            <div className={light ? "text-gray-400" : "text-gray-600"}>
              {t.noLogs}
            </div>
          ) : (
            debugMessages.map((message, index) => {
              const color =
                message.level === "error"
                  ? "text-red-500"
                  : message.level === "warn"
                    ? "text-amber-500"
                    : light
                      ? "text-blue-700"
                      : "text-blue-300";
              const location =
                message.line !== undefined
                  ? ` (line ${message.line}${message.column !== undefined ? `, column ${message.column}` : ""})`
                  : "";
              return (
                <div key={`${message.timestamp}-${index}`} className={color}>
                  <span>[{message.level}] </span>
                  <span>{message.message}{location}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );

  if (runTrigger === 0) {
    return (
      <div className="w-full h-full flex flex-col">
        <div
          className={`flex-1 flex items-center justify-center select-none min-h-0 ${
            light ? "bg-gray-100 text-gray-500" : "bg-gray-950 text-gray-600"
          }`}
        >
          <div className="text-center">
            <div className="text-3xl mb-3 opacity-40">▶</div>
            <p className="text-sm">{t.pressRun}</p>
          </div>
        </div>
        {renderDebugConsole()}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="relative flex-1 min-h-0">
        {renderPreviewToolbar()}
        <iframe
          ref={iframeRef}
          allow="camera; microphone"
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-0"
          title="p5.js preview"
          onLoad={() => sendPreviewScale(previewScale)}
        />
      </div>
      {renderDebugConsole()}
    </div>
  );
}
