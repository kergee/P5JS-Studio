import { useEffect, useRef } from "react";
import { buildSrcdoc } from "../lib/p5source";

interface PreviewProps {
  code: string;
  runTrigger: number;
}

export default function Preview({ code, runTrigger }: PreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (runTrigger === 0) return; // 不自动运行，等用户手动触发
    if (iframeRef.current) {
      iframeRef.current.srcdoc = buildSrcdoc(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runTrigger]);

  if (runTrigger === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-950 text-gray-600 select-none">
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
