# PC workflow headless verification

After `npm ci` and `npx playwright install chromium`, run `pwsh -NoProfile -File scripts/test-pc-headless.ps1`. The script starts a private Vite server on `127.0.0.1:1424`, waits for readiness, runs the checks, and stops that server. To manage the server yourself, run `node tests/headless/pc-workflow.mjs` instead.

This integration runner uses Playwright with `headless: true`; it never opens or controls the user's desktop. Playwright is a pinned development dependency. `PLAYWRIGHT_MODULE` can point to another existing Playwright package directory; `HEADLESS_CHROMIUM` optionally points to an installed headless Chromium executable. `PC_WORKFLOW_URL` overrides the server URL when managing the server yourself.

The runner loads the real React application, CodeMirror and bundled p5.js. Native Tauri file/close calls and media tracks use a fixture in an isolated browser context. It does not touch real projects, ports or cameras. Web Audio and p5 execution are real browser implementations.

Results are written to `artifacts/validation/pc-workflow/headless-results.json`. A nonzero exit means the complete run did not pass; partial receipts alone do not indicate success. Unit tests run separately through `npm test`. Native Windows/WebView2 behavior still needs desktop acceptance when authorized.
