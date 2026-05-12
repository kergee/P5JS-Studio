import { getJavaScriptDiagnostics } from "./p5Diagnostics";

export interface SyntaxCheckError {
  message: string;
  line?: number;
  column?: number;
}

export function checkJavaScriptSyntax(code: string): SyntaxCheckError | null {
  const error = getJavaScriptDiagnostics(code).find((diagnostic) => diagnostic.level === "error");
  if (!error) return null;

  return {
    message: error.message.replace(/^SyntaxError:\s*/, ""),
    line: error.line,
    column: error.column,
  };
}
