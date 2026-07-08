# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

P5JS Studio is a local desktop IDE for p5.js creative coding: Tauri v2 (Rust) shell + React/TypeScript/Vite frontend + CodeMirror 6 editor. Sketches are stored as folders on disk in the OS app-data directory (not in the repo).

## Commands

```bash
npm run dev          # Vite dev server only (frontend, port 1420)
npm run tauri dev    # Full app: Rust backend + frontend, hot reload
npm run build        # tsc typecheck + vite build (frontend-only sanity check, no bundle)
npm run tauri build  # Full production build -> src-tauri/target/release/bundle/
```

- Node >= 22 and a stable Rust toolchain are required.
- There is no frontend test runner or lint script configured (no vitest/jest/eslint in package.json). `npm run build` (tsc) is the main frontend correctness check.
- Rust has one unit test suite in `src-tauri/src/lib.rs`. Run it with `cargo test` from `src-tauri/`.
- CI (`.github/workflows/build.yml`) builds macOS universal + Windows MSI on `v*` tags or manual dispatch, via `tauri-apps/tauri-action`.

## Architecture

### Two-process split

- **Rust backend** (`src-tauri/src/lib.rs`, single file): owns all filesystem I/O. Every sketch/folder read, write, move, zip import/export goes through `#[tauri::command]` functions registered in `run()`. There is no database — the sketch tree on disk *is* the state.
- **Frontend** (`src/`): calls the backend exclusively through `src/lib/tauri.ts`, a typed wrapper around `@tauri-apps/api/core` `invoke`. When adding a new backend capability, add the command in `lib.rs`, register it in the `generate_handler!` list, then add a matching typed method in `tauri.ts`.

### Sketch storage model (mirrored in Rust and understood by the frontend)

On-disk layout under `<app-data>/com.p5jsstudio.app/sketches/`:
- A folder containing `meta.json` **is** a sketch (files list, notes, libraries). A folder without it is a category folder that can browse.
- Category folder notes live in a separate `.folder.json` so adding notes doesn't turn a category into a sketch.
- A top-level `public/` folder holds assets/libraries shared across all sketches; sketch-local files of the same relative path override `public/` ones.
- Old flat `<name>.js` files are auto-migrated to the folder format on `list_sketches`/`list_directory` (see `migrate_old_sketches` in `lib.rs`).
- ZIP import (`import_sketches_zip`) is merge-and-overwrite: local-only files are kept, ZIP files overwrite same-path local files, nothing is deleted.

### Preview sandbox (the trickiest part of the codebase)

`src/lib/p5source.ts` builds a complete standalone HTML document (`buildSrcdoc`) that is assigned to an `<iframe sandbox="allow-scripts allow-same-origin">` `srcdoc` in `src/components/Preview.tsx`. This is where most sketch-execution behavior lives:
- p5.js and p5.sound are bundled at build time via Vite `?raw` imports (offline-first, see `p5source.ts` top imports) — not fetched from a CDN.
- All sketch assets/libraries are pre-collected backend-side into a `{ relativePath: dataUrl }` map (`get_sketch_assets` in `lib.rs`) and passed into the iframe as `window.__p5studioAssets`. Inside the iframe, `fetch`, `XMLHttpRequest.open`, `<script src>`, and p5 loader functions (`loadImage`, `loadJSON`, `loadSound`, `loadModel`, `loadShader`, etc.) are monkey-patched to resolve paths against this asset map instead of hitting the network.
- `console.log/warn/error`, `window.onerror`, and unhandled promise rejections are intercepted inside the iframe and relayed to the parent window via `postMessage` (`p5studio_debug`) for the Debug Console; thumbnails are auto-captured 1.5s after run and sent back via `p5studio_thumbnail`.
- Multi-file sketches: all files in a sketch are concatenated in `meta.json`'s `files` order and share one global scope inside the iframe.
- When changing asset resolution, path normalization, or library loading, this logic must stay in sync between `p5source.ts` (frontend/iframe) and `get_sketch_assets`/`collect_declared_public_libraries` (Rust) since both sides implement matching path-normalization rules.

### Frontend structure

- `App.tsx` is a two-view switch (`gallery` | `editor`) with no router; view state, gallery path, theme, and language live here and are drilled down as props.
- `Gallery.tsx` — folder/sketch browser (breadcrumbs, cards, move/rename/delete, ZIP import/export).
- `Editor.tsx` — CodeMirror editor + `FileTabs.tsx` (multi-file tab bar) + `Preview.tsx` (iframe runner + debug console), wired together for a single open sketch.
- `store/useSketchStore.ts` — minimal Zustand store, currently just the sketch name list for the gallery.
- `lib/p5Completions.ts` / `lib/p5Diagnostics.ts` — p5-aware CodeMirror autocomplete and lightweight lint diagnostics (not full TS/JS type checking, just common p5 typos and syntax issues).
- `lib/language.ts` / `lib/theme.ts` — i18n (English/Simplified Chinese) and light/dark theme, persisted to `localStorage`.

### Path/name validation lives in Rust only

`validate_path_segment` / `normalize_rel_path` in `lib.rs` are the single source of truth for rejecting unsafe folder/file names (path traversal, reserved chars). The frontend does not duplicate this validation — it relies on backend command errors surfacing to the UI.
