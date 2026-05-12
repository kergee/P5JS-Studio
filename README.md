# P5JS Studio

[English](README.md) | [简体中文](README.zh-CN.md)

P5JS Studio is a local desktop IDE for [p5.js](https://p5js.org) creative coding, built with Tauri, React, TypeScript, and CodeMirror. It lets you write, run, organize, and back up sketches offline, with a built-in gallery, live preview, multi-file sketches, notes, thumbnails, local image assets, editor formatting, p5-aware autocomplete, and light/dark themes.

## Features

### Gallery

- Card grid for all saved sketches.
- Auto-captured thumbnail 1.5 seconds after you run a sketch.
- Notes excerpt on each sketch card.
- Drag a `.js` file onto the window to import it.
- Upload a single `.js` sketch with the file picker.
- Import and export all sketches as a `.zip` archive.
- Open the local sketch storage folder from the app.

### Editor

- Split-pane layout with CodeMirror on the left and live p5 preview on the right.
- Multi-file sketches: add extra `.js` files from the tab bar.
- All files in one sketch are concatenated in tab order and share the same global p5 scope.
- Per-sketch notes panel.
- Rename a sketch by clicking its name in the toolbar.
- p5-aware autocomplete for common functions, variables, constants, and lifecycle templates.
- Format the current file with Prettier from the toolbar or `Shift+Alt+F`.
- Adjustable editor font size with `Ctrl` + mouse wheel, `Ctrl` + `+`, `Ctrl` + `-`, or the toolbar controls.
- Light and dark UI themes, remembered between launches.

### Local Assets

Images can be placed beside a sketch and loaded with ordinary p5 paths:

```text
sketches/
  my-sketch/
    sketch.js
    pic1.png
    meta.json
```

```js
let pic;

function preload() {
  pic = loadImage("pic1.png");
}
```

You can also put shared assets in:

```text
sketches/
  public/
    pic1.png
```

Sketch-local assets take priority over `public` assets with the same path. Supported image formats include `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, and `svg`.

### Offline-first

p5.js v1 is bundled into the app at build time through Vite raw imports, so sketches can run without an internet connection.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Enter` | Run the current sketch |
| `Ctrl+S` | Save the current sketch |
| `Shift+Alt+F` | Format the current file |
| `Ctrl` + mouse wheel | Change editor font size |
| `Ctrl++` / `Ctrl+-` | Increase or decrease editor font size |

On macOS, `Cmd+S` is also supported for saving.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop shell | [Tauri v2](https://tauri.app) |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Code editor | CodeMirror 6 via `@uiw/react-codemirror` |
| Formatting | Prettier |
| State | Zustand |
| p5 runtime | p5 v1 bundled locally |
| Backend / file I/O | Rust, `std::fs`, `zip`, `base64` |
| CI / releases | GitHub Actions, Node 22, `tauri-apps/tauri-action` |

## Sketch Storage

The app stores sketches in the Tauri app data directory:

```text
<app-data>/com.p5jsstudio.app/sketches/
  my-sketch/
    meta.json
    sketch.js
    utils.js
    pic1.png
    thumbnail.png
  public/
    shared-image.png
```

`meta.json` stores notes and the ordered file list. Old flat single-file `.js` sketches are migrated to the folder format automatically on launch.

Common app data locations:

| Platform | Sketch directory |
| --- | --- |
| Windows | `%APPDATA%\com.p5jsstudio.app\sketches` |
| macOS | `~/Library/Application Support/com.p5jsstudio.app/sketches` |
| Linux | `~/.local/share/com.p5jsstudio.app/sketches` |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 22 or newer.
- [Rust](https://rustup.rs) stable toolchain.
- Windows: Visual Studio Build Tools with the C++ desktop build tools and Windows SDK.
- Linux: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`.
- macOS: no extra system dependency for normal development.

### Development

```bash
git clone https://github.com/kergee/P5JS-Studio.git
cd P5JS-Studio

npm ci
npm run tauri dev
```

### Frontend Build Check

```bash
npm run build
```

### Production Build

```bash
npm run tauri build
```

Build artifacts are written under:

```text
src-tauri/target/release/bundle/
```

## GitHub Actions

This repository includes `.github/workflows/build.yml`.

The workflow builds release artifacts for:

- macOS universal binary.
- Windows installer.
- Linux AppImage.

You can trigger it in two ways:

1. Open the GitHub repository, go to **Actions**, choose **Build & Release**, then click **Run workflow**.
2. Push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Tag pushes matching `v*` create a draft GitHub release through `tauri-apps/tauri-action`.

## Usage Guide

### Create a Sketch

1. Click **+ New Sketch** in the gallery.
2. Write p5.js code in the editor.
3. Press **Run** or `Ctrl+Enter`.
4. Press **Save** or `Ctrl+S`.

### Use Multiple Files

Click **+ Add File** in the tab bar. Files are saved inside the sketch folder and concatenated in tab order when the preview runs.

### Use Images

Place image files in the sketch folder or in the shared `public` folder, then use normal p5 code:

```js
function preload() {
  pic = loadImage("pic1.png");
}
```

### Back Up Sketches

Use **Export ZIP** to back up all sketch folders, including code, notes, thumbnails, and assets. Use **Import ZIP** to restore them.

## License

MIT
