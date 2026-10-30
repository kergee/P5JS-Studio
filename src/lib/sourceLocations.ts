export interface SourceFile { name: string; code: string }
export function combineSources(files: SourceFile[]) { return files.map((file) => file.code).join("\n"); }
export function locateSource(files: SourceFile[], line?: number, column?: number) {
  if (!line || !Number.isInteger(line) || line < 1) return {};
  let start = 1;
  for (const file of files) {
    const count = file.code.split("\n").length;
    if (line < start + count) return { file: file.name, line: line - start + 1, column };
    start += count;
  }
  return {};
}
/** Runtime stacks from the named inline sketch; never map library/HTML offsets to a student file. */
export function runtimeLocation(files: SourceFile[], source?: string, line?: number, column?: number, stack = "") {
  const match = stack.match(/studio-sketch\.js:(\d+):(\d+)/);
  if (match) return locateSource(files, Number(match[1]), Number(match[2]));
  if (source?.endsWith("studio-sketch.js")) return locateSource(files, line, column);
  return {};
}
