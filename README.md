# P5JS Studio

A local desktop IDE for [p5.js](https://p5js.org) creative coding — built with Tauri + React. Write, run, and manage sketches offline, with a built-in gallery, multi-file support, notes, and auto-captured thumbnails.

## Features

### Gallery
- Card grid of all saved sketches
- **Auto-captured thumbnail** — taken 1.5s after you click Run, stored per sketch
- **Notes excerpt** shown on each card
- Drag a `.js` file anywhere onto the window to import it instantly

### Editor
- **Split-pane layout** — CodeMirror editor on the left, live preview on the right
- **Multi-file support** — each sketch is a folder; add as many `.js` files as needed via the tab bar; all files share the same global scope when run
- **Collapsible notes panel** — per-sketch text description, saved automatically
- **Keyboard shortcuts** — `Ctrl+Enter` / `⌘+Enter` to run, `Ctrl+S` / `⌘+S` to save
- Rename sketch by clicking its name in the toolbar

### Data Management
| Action | How |
|--------|-----|
| 📁 Open Folder | Reveals the sketches directory in Finder / Explorer |
| ↑ Import ZIP | Restore sketches from a previously exported archive |
| ↓ Export ZIP | Pack all sketches (code + notes + thumbnails) into one `.zip` |
| Upload .js | File picker for importing a single sketch file |

### Offline-first
p5.js v1 is **bundled inside the app** at build time via Vite `?raw` import — no internet connection required to run sketches.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | [Tauri v2](https://tauri.app) |
| Frontend | React 18 + TypeScript + Vite |
| UI styling | Tailwind CSS |
| Code editor | [CodeMirror 6](https://codemirror.net) via `@uiw/react-codemirror` |
| State | Zustand |
| p5.js runtime | p5 v1 (bundled, offline) |
| Backend / file I/O | Rust (`std::fs`, `zip`, `base64`) |
| CI / releases | GitHub Actions — Node 22, `tauri-apps/tauri-action` |

### Sketch storage format

```
~/Library/Application Support/com.p5jsstudio.app/sketches/
  my-sketch/
    meta.json        ← { "notes": "...", "files": ["sketch.js", "utils.js"] }
    sketch.js        ← main p5.js code
    utils.js         ← optional helper files
    thumbnail.png    ← auto-captured canvas screenshot
```

Old single `.js` files are **automatically migrated** to folder format on first launch.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 22
- [Rust](https://rustup.rs) stable
- macOS system dependencies: none extra (uses WKWebView)
- Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`

### Development

```bash
git clone https://github.com/kergee/P5JS-Studio.git
cd P5JS-Studio

npm install
npm run tauri dev
```

### Production build

```bash
npm run tauri build
```

Artifacts are placed in `src-tauri/target/release/bundle/`.

---

## Releases

Pre-built binaries are available on the [Releases](https://github.com/kergee/P5JS-Studio/releases) page, built automatically via GitHub Actions on every version tag:

| Platform | File |
|----------|------|
| macOS (Universal — Intel + Apple Silicon) | `.dmg` |
| Windows | `.exe` (NSIS installer) + `.msi` |
| Linux | `.AppImage` |

---

## Usage Guide

### Creating a sketch

1. Click **+ New Sketch** in the gallery
2. Write p5.js code in the editor (standard global mode: `setup()`, `draw()`, etc.)
3. Press **▶ Run** or `Ctrl+Enter` to execute
4. Press **Save** or `Ctrl+S` — the sketch is stored locally

### Multi-file sketches

Click **+ Add File** in the tab bar to create additional `.js` files within the same sketch. All files are concatenated in tab order before running — use extra files for classes, utilities, or large datasets.

### Notes

Click **Notes** in the toolbar to open the notes panel. Write anything — description, references, parameters to tweak. Notes are saved with the sketch and shown as a subtitle in the gallery.

### Thumbnails

A screenshot is captured automatically 1.5 seconds after you click Run. It appears as the card image in the gallery. Re-run the sketch any time to refresh it.

### Importing sketches

- **Drag & drop** a `.js` file onto the gallery window
- **Upload .js** button — file picker
- **↑ Import ZIP** — restore from a previous export

### Exporting / Backup

Click **↓ Export ZIP** to save all sketches (including notes and thumbnails) to a single archive. Use **📁 Open Folder** to access the raw files directly.

---

## License

MIT
