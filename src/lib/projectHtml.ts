import p5License from "../../node_modules/p5/license.txt?raw";
import p5v2License from "../../node_modules/p5-v2/license.txt?raw";
import soundv2License from "../vendor/p5-sound-0.4.1/LICENSE?raw";
import { buildSrcdoc, escapeAttribute } from "./p5source";
import { checkProjectDependencies } from "./projectDependencies";
import { combineSources } from "./sourceLocations";
import type { HtmlProject } from "./tauri";

export function buildProjectHtml(title: string, project: HtmlProject): string {
  const unavailable = checkProjectDependencies(project.libraries, project.assets)
    .filter((library) => library.status !== "ready");
  if (unavailable.length) {
    throw new Error(unavailable.map(({ path, status }) => `${path} (${status})`).join("\n"));
  }
  const source = buildSrcdoc(
    combineSources(project.files), project.assets, project.libraries, project.p5Version, null,
  );
  const label = escapeAttribute(title);
  const licenses = project.p5Version.startsWith("2.")
    ? `p5.js ${project.p5Version}\n${p5v2License}\np5.sound 0.4.1\n${soundv2License}`
    : `p5.js ${project.p5Version} and p5.sound\n${p5License}`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${label}</title>
  <style>
    html, body, #p5studio-stage { width: 100%; height: 100%; margin: 0; background: #1a1a1a; }
    #p5studio-stage iframe { width: 100%; height: 100%; display: block; border: 0; }
  </style>
</head>
<body>
  <div id="p5studio-stage"><iframe title="${label}" sandbox="allow-scripts" srcdoc="${escapeAttribute(source)}"></iframe></div>
  <template id="p5studio-runtime-notices">${escapeAttribute(licenses)}</template>
</body>
</html>`;
}
