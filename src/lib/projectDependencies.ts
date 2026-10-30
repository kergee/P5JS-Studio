/** Checks declared classic scripts only; presence does not prove offline execution. */
export type DependencyStatus = "ready" | "missing" | "external" | "invalid";
export interface ProjectDependency { path: string; status: DependencyStatus }

export function dependencyAsset(path: string, assets: Record<string, string>) {
  const cleaned = path.split("#")[0].split("?")[0].replace(/^\.\//, "").replace(/^\/+/, "");
  return assets[path] || assets[cleaned] || assets[`/${cleaned}`];
}

export function checkProjectDependencies(libraries: string[], assets: Record<string, string>): ProjectDependency[] {
  return libraries.map((path) => {
    const trimmed = path.trim();
    if (/^(https?:|blob:|\/\/)/i.test(trimmed)) return { path, status: "external" };
    const data = trimmed.startsWith("data:") ? trimmed : dependencyAsset(trimmed, assets);
    if (!trimmed) return { path, status: "invalid" };
    if (!data) return { path, status: "missing" };
    try { decodeLocalScript(data); return { path, status: "ready" }; }
    catch { return { path, status: "invalid" }; }
  });
}

export function decodeLocalScript(data: string): string {
  const comma = data.indexOf(",");
  if (!data.startsWith("data:") || comma < 0) throw new Error("Invalid local script");
  const header = data.slice(0, comma);
  const body = data.slice(comma + 1);
  if (!header.includes(";base64")) return decodeURIComponent(body);
  const binary = atob(body);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export const dependencyText = {
  "zh-CN": {
    title: "项目依赖（可选）", hint: "添加本地经典脚本，按列表顺序在草图前加载。调整后需保存，下次运行生效；移除声明不会删除文件。",
    choose: "选择本地 JS", add: "加入依赖", up: "上移", down: "下移", remove: "移除声明",
    ready: "本地可用", missing: "缺少文件", external: "请改用本地文件", invalid: "文件无法读取",
    boundary: "检查仅覆盖已声明的脚本，不保证模型、动态资源或在线 API 离线可用。请断网实际运行后再归档。",
    blocked: "依赖未就绪，请在“资源 → 项目依赖”中检查：", empty: "没有额外脚本依赖。p5.js 和对应声音库已内置。",
  },
  en: {
    title: "Project dependencies (optional)", hint: "Local classic scripts load in list order before the sketch. Save changes; they apply on the next Run. Removing an entry keeps its file.",
    choose: "Choose local JS", add: "Add dependency", up: "Move up", down: "Move down", remove: "Remove entry",
    ready: "Available locally", missing: "Missing file", external: "Use a local file", invalid: "Unreadable file",
    boundary: "Only declared scripts are checked. Models, dynamic assets and online APIs may still need a network. Test offline before archiving.",
    blocked: "Dependencies are not ready. Check Resources → Project dependencies:", empty: "No extra scripts. p5.js and its matching sound library are bundled.",
  },
};
