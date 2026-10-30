import { runtimeLocation, type SourceFile } from "../lib/sourceLocations";
import { pcWorkflowText } from "../lib/pcWorkflowText";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { buildSrcdoc } from "../lib/p5source";
import { DebugMessage } from "../lib/debug";
import { Language, text } from "../lib/language";
import { ColorTheme, isLightTheme } from "../lib/theme";
import SerialPanel from "./SerialPanel";
import type { SerialController } from "../store/useSerial";
import { serialText } from "../lib/serial";
import { matchesSerialScope, validSerialLine, type SerialScope } from "../lib/serialProtocol";

const MIN_PREVIEW_SCALE = 0.1;
const MAX_PREVIEW_SCALE = 2;
const PREVIEW_SCALE_STEP = 0.1;

function clampPreviewScale(scale: number) {
  return Math.min(MAX_PREVIEW_SCALE, Math.max(MIN_PREVIEW_SCALE, scale));
}

function formatDebugMessages(messages: DebugMessage[]) {
  return messages
    .map((message) => {
      const location =
        message.line !== undefined
          ? ` (${message.file ? `${message.file}:` : "line "}${message.line}${message.column !== undefined ? `, column ${message.column}` : ""})`
          : "";
      return `[${message.level}] ${message.message}${location}`;
    })
    .join("\n");
}

async function copyTextToClipboard(textValue: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(textValue);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = textValue;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

interface PreviewProps {
  serial: SerialController;
  serialEnabled: boolean;
  serialOpenTrigger: number;
  serialProject: string | null;
  sourceFiles: SourceFile[];
  onLocate: (message: DebugMessage) => void;
  code: string;
  assets?: Record<string, string>;
  libraries?: string[];
  runTrigger: number;
  p5Version: string;
  onThumbnail?: (dataUrl: string) => void;
  debugMessages: DebugMessage[];
  onDebugMessage?: (message: DebugMessage) => void;
  onRunStart?: () => void;
  onClearDebug?: () => void;
  theme: ColorTheme;
  language: Language;
}

export default function Preview({
  serial,
  serialEnabled,
  serialOpenTrigger,
  serialProject,
  code,
  sourceFiles,
  onLocate,
  assets = {},
  libraries = [],
  runTrigger,
  p5Version,
  onThumbnail,
  debugMessages,
  onDebugMessage,
  onRunStart,
  onClearDebug,
  theme,
  language,
}: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const frameScope = useRef<SerialScope>({ owner: "", project: "", run: "" });
  const lastRun = useRef({ code, sourceFiles, assets, libraries, p5Version });
  const [stoppedRun, setStoppedRun] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const running = runTrigger > 0 && stoppedRun !== runTrigger;
  const pc = pcWorkflowText[language];
  const stop = () => {
    frameScope.current = { owner: "", project: "", run: "" };
    setStoppedRun(runTrigger);
  };
  const toggleFullscreen = async () => {
    if (fullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen();
      setFullscreen(false);
    } else {
      setFullscreen(true);
      try { await rootRef.current?.requestFullscreen(); } catch { /* Window-filling preview remains available. */ }
    }
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setFullscreen(false); } };
    const changed = () => { if (!document.fullscreenElement) setFullscreen(false); };
    window.addEventListener("keydown", escape); document.addEventListener("fullscreenchange", changed);
    return () => { window.removeEventListener("keydown", escape); document.removeEventListener("fullscreenchange", changed); };
  }, []);
  const [toolTab, setToolTab] = useState<"debug" | "serial">("serial");
  const [toolRatio, setToolRatio] = useState(1 / 3);
  const [previewScale, setPreviewScale] = useState(1);
  const [debugCollapsed, setDebugCollapsed] = useState(false);
  const light = isLightTheme(theme);
  const t = text[language];
  const st = serialText[language];
  useEffect(() => {
    if (serialOpenTrigger > 0) { setToolTab("serial"); setDebugCollapsed(false); }
  }, [serialOpenTrigger]);

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
    if (!running) return;
    onRunStart?.();
    lastRun.current = { code, sourceFiles: sourceFiles.map((file) => ({ ...file })), assets, libraries, p5Version };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runTrigger]);

  useEffect(() => {
    if (!running) return;
    const scope = { owner: serial.owner, project: serialProject ?? "", run: crypto.randomUUID() };
    frameScope.current = scope;
    if (iframeRef.current) {
      const snapshot = lastRun.current;
      iframeRef.current.srcdoc = buildSrcdoc(snapshot.code, snapshot.assets, snapshot.libraries, snapshot.p5Version, scope);
    }
    return () => { frameScope.current = { owner: "", project: "", run: "" }; };
  }, [runTrigger, running, serialEnabled, serial.owner, serialProject]);

  const sendSerialStatus = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "p5studio_serial_status", ...frameScope.current, connected: !!serial.session }, "*");
  }, [serial.session]);
  useEffect(sendSerialStatus, [sendSerialStatus]);
  useEffect(() => serial.subscribe((lines) => {
    if (frameScope.current.owner !== serial.owner || !serial.session) return;
    iframeRef.current?.contentWindow?.postMessage({ type: "p5studio_serial_lines", ...frameScope.current, lines }, "*");
  }), [serial.subscribe, serial.owner, serial.session]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!serialEnabled || event.source !== iframeRef.current?.contentWindow || !matchesSerialScope(event.data, frameScope.current)) return;
      const data = event.data;
      if (data.type === "p5studio_serial_ready") sendSerialStatus();
      if (data.type !== "p5studio_serial_write" || !Number.isSafeInteger(data.id) || data.id < 1) return;
      const scope = { ...frameScope.current };
      const reply = (error?: string) => {
        if (matchesSerialScope(scope, frameScope.current)) iframeRef.current?.contentWindow?.postMessage({ type: "p5studio_serial_reply", ...scope, id: data.id, error }, "*");
      };
      if (!validSerialLine(data.text)) { reply("Expected one UTF-8 line, at most 8192 bytes"); return; }
      if (!serial.session || scope.owner !== serial.owner) { reply("Device is not connected"); return; }
      void serial.writeLine(data.text).then(() => reply(), (error) => reply(String(error)));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [serialEnabled, serial.owner, serial.session, serial.writeLine, sendSerialStatus]);

  // Listen for thumbnail and debug messages captured inside iframe via postMessage
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!running || e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "p5studio_thumbnail") {
        onThumbnail?.(e.data.data as string);
      }
      if (e.data?.type === "p5studio_debug") {
        onDebugMessage?.({
          level: e.data.level === "warn" || e.data.level === "error" ? e.data.level : "log",
          message: String(e.data.message ?? ""),
          ...runtimeLocation(lastRun.current.sourceFiles,
            typeof e.data.source === "string" ? e.data.source : undefined,
            typeof e.data.line === "number" ? e.data.line : undefined,
            typeof e.data.column === "number" ? e.data.column : undefined,
            typeof e.data.stack === "string" ? e.data.stack : ""),
          timestamp: Date.now(),
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onThumbnail, onDebugMessage, running]);

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

  const copyDebugMessages = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (debugMessages.length === 0) return;
      void copyTextToClipboard(formatDebugMessages(debugMessages));
    },
    [debugMessages]
  );

  const renderPreviewToolbar = () => (
    <div
      className={`absolute right-3 top-3 z-10 flex items-center gap-1 rounded border px-1.5 py-1 text-xs ${previewToolbarClass}`}
    >
      <button className={`h-6 rounded px-2 ${previewButtonClass}`} disabled={!running} onClick={stop}>{pc.stop}</button>
      <button className={`h-6 rounded px-2 ${previewButtonClass}`} onClick={() => void toggleFullscreen()}>{fullscreen ? pc.exitFullscreen : pc.fullscreen}</button>
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
    <div className={`${serialEnabled ? "h-full min-h-0" : debugCollapsed ? "h-9" : "h-36"} border-t text-xs flex flex-col ${consoleClass}`}>
      {!serialEnabled && <div
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
        <div className="flex items-center gap-1">
          <button
            onClick={copyDebugMessages}
            disabled={debugMessages.length === 0}
            className={`px-2 py-0.5 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              light
                ? "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                : "text-gray-500 hover:text-white hover:bg-gray-800"
            }`}
            title={t.copyLogs}
          >
            {t.copyLogs}
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
      </div>}
      {(!debugCollapsed || serialEnabled) && (
        <div className="flex-1 min-h-0 overflow-auto px-3 py-2 font-mono whitespace-pre-wrap break-words">
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
                  ? ` (${message.file ? `${message.file}:` : "line "}${message.line}${message.column !== undefined ? `, column ${message.column}` : ""})`
                  : "";
              return (
                <div key={`${message.timestamp}-${index}`} className={color}>
                  <span>[{message.level}] </span>
                  <span>{message.message}</span>
                  {message.file && message.line ? <button className="underline text-left ml-1" onClick={() => onLocate(message)}>{location}</button> : <span>{location}</span>}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );

  const renderTools = () => {
    if (!serialEnabled) return renderDebugConsole();
    return <div className={`min-h-0 flex flex-col overflow-hidden border-t text-xs ${consoleClass}`}
      style={{ flex: debugCollapsed ? "0 0 36px" : `0 0 ${toolRatio * 100}%` }}>
      {!debugCollapsed && <button type="button" role="separator" aria-label={st.resize} aria-orientation="horizontal"
        aria-valuemin={15} aria-valuemax={50} aria-valuenow={Math.round(toolRatio * 100)}
        className="h-1 w-full shrink-0 cursor-row-resize bg-gray-400/30 hover:bg-blue-500/50 focus:bg-blue-500/50"
        onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = rootRef.current?.getBoundingClientRect(); if (rect?.height) setToolRatio(Math.max(.15, Math.min(.5, (rect.bottom - event.clientY) / rect.height))); }}
        onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onKeyDown={(event) => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setToolRatio((value) => Math.max(.15, Math.min(.5, value + (event.key === "ArrowUp" ? .05 : -.05)))); } }} />}
      <div className="flex shrink-0 flex-wrap items-center gap-1 px-2 py-1">
        <div role="group" aria-label={language === "zh-CN" ? "预览工具" : "Preview tools"} className="flex gap-1">
          <button type="button" aria-pressed={toolTab === "debug"} onClick={() => { setToolTab("debug"); setDebugCollapsed(false); }} className={`px-2 py-1 rounded ${toolTab === "debug" ? "bg-blue-500/20" : ""}`}>{st.debug}</button>
          <button type="button" aria-pressed={toolTab === "serial"} onClick={() => { setToolTab("serial"); setDebugCollapsed(false); }} className={`px-2 py-1 rounded ${toolTab === "serial" ? "bg-blue-500/20" : ""}`}>ESP32{serial.session && <span className="ml-1 text-green-500">●</span>}</button>
        </div>
        {toolTab === "debug" && <><button type="button" onClick={copyDebugMessages} disabled={!debugMessages.length} className="px-1">{t.copyLogs}</button><button type="button" onClick={onClearDebug} className="px-1">{t.clear}</button></>}
        <button type="button" aria-label={debugCollapsed ? st.expand : st.collapse} title={debugCollapsed ? st.expand : st.collapse} className="ml-auto px-2 py-1"
          onClick={() => setDebugCollapsed((value) => !value)}>{debugCollapsed ? "▴" : "▾"}</button>
      </div>
      <div className={debugCollapsed ? "hidden" : "min-h-0 flex-1 overflow-hidden"}>
        {toolTab === "serial" ? <SerialPanel serial={serial} project={serialProject} theme={theme} language={language} /> : renderDebugConsole()}
      </div>
    </div>;
  };

  if (!running) {
    return (
      <div ref={rootRef} className={`${fullscreen ? `fixed inset-0 z-50 ${light ? "bg-white" : "bg-gray-950"}` : "w-full h-full"} min-h-0 flex flex-col overflow-hidden`}>
        <div
          className={`relative flex-1 flex items-center justify-center select-none min-h-0 ${
            light ? "bg-gray-100 text-gray-500" : "bg-gray-950 text-gray-600"
          }`}
        >
          {renderPreviewToolbar()}
          <div className="text-center">
            <div className="text-3xl mb-3 opacity-40">▶</div>
            <p className="text-sm">{runTrigger > 0 ? pc.stopped : t.pressRun}</p>
          </div>
        </div>
        {renderTools()}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`${fullscreen ? `fixed inset-0 z-50 ${light ? "bg-white" : "bg-gray-950"}` : "w-full h-full"} min-h-0 flex flex-col overflow-hidden`}>
      <div className="relative flex-1 min-h-0">
        {renderPreviewToolbar()}
        <iframe
          key={`${serialEnabled ? "serial" : "standard"}:${serial.owner}:${serialProject}:${runTrigger}`}
          ref={iframeRef}
          allow="camera; microphone"
          sandbox={serialEnabled ? "allow-scripts" : "allow-scripts allow-same-origin"}
          className="w-full h-full border-0"
          title="p5.js preview"
          onLoad={() => { sendPreviewScale(previewScale); sendSerialStatus(); }}
        />
      </div>
      {renderTools()}
    </div>
  );
}
