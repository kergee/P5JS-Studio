# P5JS Studio

[English](README.md) | [简体中文](README.zh-CN.md)

P5JS Studio is a local desktop IDE for [p5.js](https://p5js.org) creative coding, built with Tauri, React, TypeScript, and CodeMirror. It lets you write, run, organize, debug, and back up sketches offline, with a built-in gallery, folder-based sketch management, live preview, multi-file sketches, notes, thumbnails, local assets and libraries, editor formatting, p5-aware autocomplete, debug output, preview zoom, and light/dark themes.

## Screenshot

![1.3 resources and project runtime selection](docs/images/p5js-studio-v1.3-resources.png)

Version 1.3 resource management, project export and runtime selection, using the repository's own anonymous example.

![P5JS Studio folder gallery and code editor with a running sketch](docs/images/p5js-studio-gallery-editor.png)

Folder-based organization and live sketch preview in P5JS Studio. The demo sketch shown in the editor is by Juan Carlos Ponce Campuzano and is used here to demonstrate the application.

## Features

### Gallery

- File-manager style gallery with folders, breadcrumbs, and sketch cards.
- Nested folders for organizing sketches by class, topic, assignment, or project.
- A folder with `meta.json` is treated as a sketch; other folders are treated as categories.
- Category folders can store their own notes in `.folder.json`.
- Returning from the editor keeps the current gallery folder and breadcrumb path.
- Auto-captured thumbnail 1.5 seconds after you run a sketch.
- Notes excerpt on each sketch card.
- Optional 1–5 star ratings (clear to unrated) and independent favorites on each project card.
- Search across project names, folder paths and notes; combine exact-rating, unrated and favorite filters, across all projects or the current folder.
- Ratings (`rating: 0` means unrated) and favorites (`favorite`) are saved in `meta.json`, preserved by saves, renames, moves and project ZIPs. Existing projects default to unrated and not favorited.
- Drag a `.js` file onto the window to import it.
- Upload a single `.js` sketch with the file picker.
- Move sketches between folders.
- Rename folders and delete empty folders.
- Import and export all sketches as a `.zip` archive while preserving folder structure.
- Open the local sketch storage folder from the app.
- English / Simplified Chinese UI language switcher.
- Built-in Help panel for the main features and shortcuts.

### Editor

- Resizable split-pane layout with CodeMirror on the left and live p5 preview on the right.
- Multi-file sketches: add extra `.js` files from the tab bar.
- All files in one sketch are concatenated in tab order and share the same global p5 scope.
- Per-sketch notes panel.
- Rename a sketch by clicking its name in the toolbar.
- Run automatically saves the current sketch files and notes before starting the preview.
- p5-aware autocomplete for common functions, variables, constants, and lifecycle templates.
- Lightweight editor diagnostics for syntax errors and common p5 function typos.
- Format the current file with Prettier from the toolbar or `Shift+Alt+F`.
- Adjustable editor font size with `Ctrl` + mouse wheel, `Ctrl` + `+`, `Ctrl` + `-`, or the toolbar controls.
- Light and dark UI themes, remembered between launches.

### Preview and Debug

- Preview iframe runs the sketch in an isolated sandbox.
- Large canvases can be inspected with scrollbars.
- Preview zoom controls let you zoom out from very large canvases or reset to 100%.
- Debug Console captures `console.log`, `console.warn`, and `console.error`.
- Debug Console can be collapsed from its title bar while still showing log count and severity.
- Debug Console logs can be copied as plain text from the console toolbar.
- Runtime errors, syntax errors, and unhandled Promise rejections are shown in the Debug Console.
- Thumbnails are captured automatically after running a sketch.

### Local Assets

Images can be placed beside a sketch and loaded with ordinary p5 paths:

```text
sketches/
  particles/
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

### Third-party Libraries

`p5.sound` is bundled and loaded by default, so sound sketches can use APIs such as `loadSound()` without extra setup.

Manage other local classic browser/global scripts in Resources, or edit the sketch's `meta.json` directly. Place the library file in the sketch folder or the shared `public` folder, then list the relative path in the `libraries` array:

```json
{
  "files": ["sketch.js"],
  "libraries": ["libraries/matter.min.js", "libraries/p5.play.js"]
}
```

Example sketch layout:

```text
sketches/
  physics-demo/
    meta.json
    sketch.js
    libraries/
      matter.min.js
      p5.play.js
```

Libraries load in the listed order before your sketch code. Sketch-local libraries take priority over shared `public` libraries with the same path. Missing declared libraries are listed before running.

The Resources panel manages local script declarations and their load order. It supports local classic scripts that expose browser globals, not npm package installs, ES module imports, or automatic CDN downloads.

### Optional third-party compatibility

Third-party support serves archiving and offline reproduction of existing work. P5JS Studio loads local classic scripts through one shared workflow. It does not provide a dedicated machine-learning or 3D workbench, or promise compatibility with every library, model or version. Existing ml5 path compatibility is retained.

Use **Resources → Project dependencies (optional)** to select local JS files, change load order or remove declarations. Changes are saved with the project and apply on the next Run. Missing or unreadable declared scripts are listed before running. These checks do not execute libraries or prove that models, dynamic assets or online APIs work offline. Add files to the project first, or use existing shared public files.

See [optional local ml5 model configuration](docs/optional-ml5-models.en.md).

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
  particles/
    my-sketch/
      meta.json
      sketch.js
      utils.js
      pic1.png
      thumbnail.png
  class-1/
    .folder.json
    student-1/
      meta.json
      sketch.js
  public/
    shared-image.png
```

`meta.json` stores sketch notes, library declarations, and the ordered file list. Any folder containing `meta.json` is a sketch folder. Any folder without `meta.json` is a category folder. Category folder notes are stored in `.folder.json` so they do not turn the category into a sketch. Old flat single-file `.js` sketches are migrated to the folder format automatically on launch.

Common app data locations:

| Platform | Sketch directory |
| --- | --- |
| Windows | `%APPDATA%\com.p5jsstudio.app\sketches` |
| macOS | `~/Library/Application Support/com.p5jsstudio.app/sketches` |
| Linux | `~/.local/share/com.p5jsstudio.app/sketches` |

The editor's p5.js dropdown selects bundled **1.11.13** or **2.3.4** for the next Run. Each project stores its exact version in `meta.json` as `p5Version`. Legacy projects without this field use the current bundled 1.x version (1.11.13 in this release) and persist it on their next save. Settings only changes the default for new projects. Unavailable versions remain recorded and block Run until a bundled version is selected. Each runtime includes its corresponding local sound library. Switching does not convert code. API completion and typo hints currently target 1.x and are disabled for 2.x.

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
- Windows EXE installer (NSIS). Windows builds no longer generate MSI packages.

You can trigger it in two ways:

1. Open the GitHub repository, go to **Actions**, choose **Build & Release**, then click **Run workflow**.
2. Push a version tag:

```bash
git tag v1.2.9
git push origin v1.2.9
```

Tag pushes matching `v*` create a GitHub Release through `tauri-apps/tauri-action`.

### Release Notes and Changelog

The current workflow creates a GitHub Release with a fixed download section. After the build finishes, you can edit the release on GitHub and click **Generate release notes** to let GitHub create a changelog from merged commits and pull requests.

A practical release flow is:

```bash
git tag v1.2.9
git push origin v1.2.9
```

Then open **GitHub > Releases**, edit the draft release, click **Generate release notes**, review the generated text, and publish the release.

If you want a repository changelog file as well, keep a `CHANGELOG.md` and copy the reviewed release notes into it before tagging the next release. For a more automated setup later, use Conventional Commits plus a tool such as `release-please` or `standard-version`.

## Usage Guide

### Create a Sketch

1. Click **+ New Sketch** in the gallery.
2. Write p5.js code in the editor.
3. Press **Run** or `Ctrl+Enter`. Running saves the sketch first.
4. Press **Save** or `Ctrl+S` whenever you want to save without running.

### Use Multiple Files

Click **+ Add File** in the tab bar. Files are saved inside the sketch folder and concatenated in tab order when the preview runs.

### Organize with Folders

Use **New Folder** to create category folders, then create sketches inside them. Folder breadcrumbs let you navigate back to parent folders. If you open a sketch from a subfolder and return to the gallery, the same folder stays open. Use **Move** on a sketch card to move it to another folder.

Category folders have their own Notes area in the gallery. These notes are saved to `.folder.json` inside that folder. A folder that only contains `.folder.json` is still treated as empty for deletion.

### Use Images

Place image files in the sketch folder or in the shared `public` folder, then use normal p5 code:

```js
function preload() {
  pic = loadImage("pic1.png");
}
```

### Use Libraries

Add third-party `.js` files to the project, declare and order them under Resources → Project dependencies (optional), then save and run. Shared public libraries can also be declared by closing the editor and editing the `libraries` array in `meta.json`. The listed libraries load before your sketch files and are included in ZIP backup and restore.

### Project Submission and Backups

Students use **Export Project ZIP** in the editor to package one project's JS files, assets, libraries, notes, thumbnail and exact p5.js version. Teachers use **Import Project ZIP** in the gallery. It defaults to the current folder, supports choosing/creating categories and importing multiple ZIPs, and keeps both same-name projects unless Skip is selected. Each archive is validated before its staged directory is installed. Failures are reported separately.

**Export This Folder** packages a category. **Back Up All** packages the whole library. **Restore Backup ZIP** restores these directory archives to the root, confirms overwrites and first creates a full backup under the application's `backups` directory. Unmatched local files are kept. The result shows the backup location. Use project import for single-project archives and backup restore for directory archives.

Ordinary shared `public` assets are copied into each project to preserve dynamic relative paths. An export may therefore include unused shared assets: review that directory before sharing. Declared local libraries and model dependencies are included. Remote URLs, APIs and models that were not downloaded still require a network.

Project archives must contain `meta.json` and every listed code file. One wrapper directory is supported. Arbitrary HTML ZIP conversion is not implemented. See the [teaching workflow](docs/teaching-workflow.zh-CN.md) and [examples](examples/README.md).

### Add Local Resources

Open **Resources** and select multiple files or drop files into the window. The default subfolder is `assets`. Same-name resources keep both copies unless Replace is checked. Copy relative paths for `loadImage`, `loadSound`, etc. Removal asks for confirmation and does not modify code references. Code and metadata cannot be replaced through this panel.

### Save and Rename

The status shows unsaved, saving, saved and errors. Leaving or closing with changes offers Save and leave, Discard, or Cancel. Run and export save first. Renaming takes effect on the next save and moves the whole project, including assets, libraries and notes. A failed save keeps editor contents and never overwrites another project.

### Debug a Sketch

Use `console.log(...)` in your p5 code and check the Debug Console under the preview. Click the Debug Console title bar to hide or show it. Syntax errors, common misspelled p5 functions, runtime errors, and async errors are also reported there.

## Roadmap

The product remains focused on **collecting, organizing and archiving student projects** and **editing and running p5.js offline**. New capabilities should support these workflows. ESP32 integration is an optional extension for interactive projects, preserving the main gallery and editor flows.

- Autosave policy and classroom batch archive improvements.
- p5.js 2.x completion and diagnostics.
- Dependency completeness and offline reproduction checks. Keep ml5 / three.js as optional compatibility and examples; defer dedicated model management and 3D editing tools.
- Optional online model API assistance for arbitrary HTML ZIP conversion, with a proposed diff and user confirmation. Validate structure, assets and actual execution independently; model output does not guarantee a working sketch.

### ESP32 USB serial (source prototype; hardware acceptance pending)

On Windows, open **More tools → ESP32** in the editor. Debug and ESP32 share the preview's bottom panel, initially one third of its height, resizable up to one half and collapsible. The gallery has no hardware controls; non-Windows platforms have no USB entry. Rust manages one serial connection in a background worker, using 115200 / 8N1 / no flow control by default and UTF-8 text lines.

Sketches use `studioSerial.onLine(callback)`, `await studioSerial.writeLine(text)` and read-only `studioSerial.connected`. Connections require a manual action in the panel. Opening, importing or running a project never automatically connects or sends commands. Re-running keeps the device connection and clears old subscriptions. Leaving the editor, saving a rename, disconnecting or closing releases it; cancelling navigation keeps it. No meta.json changes, saved port or auto-connect setting.

Two anonymous [teaching ZIPs](examples/README.md) include sketches, firmware sources, wiring and protocol notes. Prepare firmware externally. See the [USB implementation and acceptance guide](docs/esp32-usb.zh-CN.md) for details, API and isolation limitations.

**Software prototype; complete hardware acceptance remains pending. Basic C3 serial connectivity feedback does not establish acceptance of the universal firmware, buttons, LEDs or RSSI. Official v1.3.2 release installers do not include these additions. Manual Actions test packages keep version 1.3.2 and are identified by commit and run ID.**

See the [2026-10-31 directory-switch update notes](docs/pc-update-20261031.zh-CN.md) for changes and validation boundaries. Manually run [Build & Release](https://github.com/kergee/P5JS-Studio/actions/workflows/build.yml) to build Windows by default, then download the EXE from that run's Artifacts. Manual builds do not create a public Release. Windows local builds also default to NSIS through `src-tauri/tauri.windows.conf.json`; macOS builds keep their existing targets.

Complete real-board bidirectional communication, busy-port/unplug/reconnect and ordinary-project regression checks before deciding on a release. Wi-Fi, multiple devices, phone USB, firmware compilation and flashing remain deferred. Mobile remains focused on organizing and running projects offline.

See the [Chinese talk and demo guide](docs/pcd2026-talk.zh-CN.md) and [1.3.0 changes](CHANGELOG.md).

## License

MIT
