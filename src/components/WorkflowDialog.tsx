import { useEffect, useRef, type ReactNode } from "react";
import { isLightTheme, type ColorTheme } from "../lib/theme";

export default function WorkflowDialog({ title, theme, children }: { title: string; theme: ColorTheme; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const elements = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]');
        if (!elements?.length) { event.preventDefault(); return; }
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
        if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
      }}
      className={`w-full max-w-2xl max-h-[85vh] overflow-auto rounded-lg border p-5 shadow-xl outline-none ${isLightTheme(theme) ? "bg-white text-gray-900 border-gray-200" : "bg-gray-800 text-gray-100 border-gray-600"}`}>
      <h2 className="text-lg font-semibold mb-4">{title}</h2>{children}
    </div>
  </div>;
}
