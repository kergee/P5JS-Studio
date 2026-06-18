# P5JS Studio

[English](README.md) | [简体中文](README.zh-CN.md)

P5JS Studio is a local desktop IDE for [p5.js](https://p5js.org) creative coding, built with Tauri, React, TypeScript, and CodeMirror. It lets you write, run, organize, debug, and back up sketches offline, with a built-in gallery, folder-based sketch management, live preview, multi-file sketches, notes, thumbnails, local assets and libraries, editor formatting, p5-aware autocomplete, debug output, preview zoom, and light/dark themes.

## Features

### Gallery

- File-manager style gallery with folders, breadcrumbs, and sketch cards.
- Nested folders for organizing sketches by class, topic, assignment, or project.
- A folder with `meta.json` is treated as a sketch; other folders are treated as categories.
- Category folders can store their own notes in `.folder.json`.
- Returning from the editor keeps the current gallery folder and breadcrumb path.
- Auto-captured thumbnail 1.5 seconds after you run a sketch.
- Notes excerpt on each sketch card.
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

For other classic browser/global JavaScript libraries, edit the sketch's `meta.json` directly. Place the library file in the sketch folder or the shared `public` folder, then list the relative path in the `libraries` array:

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

Libraries load in the listed order before your sketch code. Sketch-local libraries take priority over shared `public` libraries with the same path. Missing library paths are reported in the Debug Console.

This first version does not include a library manager UI. It supports local classic scripts that expose browser globals, not npm package installs, ES module imports, or automatic CDN downloads.

### Local ml5.js Models

ml5 examples can run offline when both the JavaScript library and the model files are stored in the sketch library paths. A common shared layout is:

```text
sketches/
  public/
    libraries/
      ml5.min.js
      ml5-models/
        sentiment_cnn_v1/
          model.json
          metadata.json
          group1-shard1of1
        ar_portrait_depth/
          model.json
          group1-shard1of3.bin
        selfie_segmentation_general/
          model.json
          group1-shard1of1.bin
```

Then declare ml5 in the sketch `meta.json`:

```json
{
  "files": ["sketch.js"],
  "libraries": ["libraries/ml5.min.js"]
}
```

For ml5 models that accept model URL options, point those options at local `model.json` files:

```js
const depth = await ml5.depthEstimation("ARPortraitDepth", {
  depthModelUrl: "libraries/ml5-models/ar_portrait_depth/model.json",
  segmentationModelUrl: "libraries/ml5-models/selfie_segmentation_general/model.json",
  applySegmentationMask: false
});
```

For MediaPipe-backed models such as FaceMesh or HandPose, keep the runtime on MediaPipe and set `solutionPath` to the local MediaPipe package folder:

```js
const faceMesh = await ml5.faceMesh({
  runtime: "mediapipe",
  maxFaces: 1,
  flipHorizontal: true,
  solutionPath: "libraries/mediapipe/face_mesh"
});
```

For `ml5.sentiment()`, keep the model name as `"MovieReviews"` rather than passing a folder path. P5JS Studio redirects ml5's default `sentiment_cnn_v1` model URL to `libraries/ml5-models/sentiment_cnn_v1/` when those files exist locally:

```js
const sentiment = await ml5.sentiment("MovieReviews");
const result = await sentiment.predict("I love this sketch");
```

For other ml5 models, use the same pattern: download the model's `model.json`, metadata files, and all weight shard files; preserve their relative filenames; put them under `public/libraries/ml5-models/<model-name>/`; then pass the local `model.json` through the ml5 option used by that model, such as `modelUrl`, `modelURL`, `detectorModelUrl`, `landmarkModelUrl`, or a model-specific URL option. If the model uses a MediaPipe solution package instead of TFJS weight shards, copy the whole MediaPipe package folder and use `solutionPath`.

### Offline-first

p5.js v1 and p5.sound are bundled into the app at build time through Vite raw imports, so sketches can run without an internet connection.

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
- Windows MSI installer.

You can trigger it in two ways:

1. Open the GitHub repository, go to **Actions**, choose **Build & Release**, then click **Run workflow**.
2. Push a version tag:

```bash
git tag v1.2.8
git push origin v1.2.8
```

Tag pushes matching `v*` create a draft GitHub release through `tauri-apps/tauri-action`.

### Release Notes and Changelog

The current workflow creates a draft GitHub Release with a fixed download section. After the build finishes, you can edit the draft release on GitHub and click **Generate release notes** to let GitHub create a changelog from merged commits and pull requests.

A practical release flow is:

```bash
git tag v1.2.8
git push origin v1.2.8
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

Put third-party `.js` files beside the sketch or in `public`, then add them to the sketch `meta.json` `libraries` array. Edit `meta.json` directly, save it, and run the sketch again. The listed libraries load before your sketch files and are included in ZIP backup and restore.

### Back Up Sketches

Use **Export ZIP** to back up all sketch folders, including code, sketch notes, folder notes, thumbnails, libraries, and assets. Use **Import ZIP** to restore them.

ZIP import uses a merge-and-overwrite strategy:

- Files and folders that exist in the ZIP but not locally are added.
- Files that exist both locally and in the ZIP are overwritten without a prompt.
- Local files that are not present in the ZIP are kept; import does not delete extra local files.
- The same rule applies to `meta.json`, `.folder.json`, thumbnails, libraries, and assets.

### Debug a Sketch

Use `console.log(...)` in your p5 code and check the Debug Console under the preview. Click the Debug Console title bar to hide or show it. Syntax errors, common misspelled p5 functions, runtime errors, and async errors are also reported there.

## Roadmap

- Optional p5 runtime switching, including a future p5 v2 compatibility mode.
- More advanced release note automation.
- More complete editor diagnostics.
- Configurable autosave behavior and a clearer save status indicator.

## License

MIT
