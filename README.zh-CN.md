# P5JS Studio

[English](README.md) | [简体中文](README.zh-CN.md)

P5JS Studio 是一个本地桌面版 [p5.js](https://p5js.org) 创意编程 IDE，基于 Tauri、React、TypeScript 和 CodeMirror 构建。它可以离线编写、运行、整理和备份草图，内置图库、实时预览、多文件草图、笔记、缩略图、本地图片资源、代码格式化、p5 补全提示，以及亮色/暗色主题。

## 功能

### 图库

- 以卡片网格展示所有已保存草图。
- 点击运行草图 1.5 秒后自动截取缩略图。
- 草图卡片显示笔记摘要。
- 支持把 `.js` 文件拖进窗口直接导入。
- 支持通过文件选择器上传单个 `.js` 草图。
- 支持把所有草图导入/导出为 `.zip` 压缩包。
- 可直接从应用中打开本地草图存储目录。

### 编辑器

- 左侧 CodeMirror 编辑器，右侧 p5 实时预览。
- 支持多文件草图，可通过文件标签栏添加额外 `.js` 文件。
- 同一个草图内的所有文件会按标签顺序拼接运行，并共享同一个 p5 全局作用域。
- 每个草图都有独立笔记面板。
- 点击工具栏里的草图名可以重命名。
- 提供轻量 p5 补全提示，覆盖常用函数、变量、常量和生命周期模板。
- 支持用 Prettier 格式化当前文件，可点击工具栏按钮或使用 `Shift+Alt+F`。
- 支持调整编辑器字体大小：`Ctrl` + 鼠标滚轮、`Ctrl` + `+`、`Ctrl` + `-`，或使用工具栏按钮。
- 支持亮色和暗色 UI 主题，并会记住上次选择。

### 本地资源

图片可以放在草图目录中，并用普通 p5 路径加载：

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

也可以把多个草图共用的资源放到：

```text
sketches/
  public/
    pic1.png
```

如果草图目录和 `public` 目录里有同名资源，草图目录中的文件优先。当前支持的图片格式包括 `png`、`jpg`、`jpeg`、`gif`、`webp`、`bmp` 和 `svg`。

### 离线优先

p5.js v1 会在构建时通过 Vite raw import 打包进应用，因此草图运行不需要联网。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+Enter` | 运行当前草图 |
| `Ctrl+S` | 保存当前草图 |
| `Shift+Alt+F` | 格式化当前文件 |
| `Ctrl` + 鼠标滚轮 | 调整编辑器字体大小 |
| `Ctrl++` / `Ctrl+-` | 增大或减小编辑器字体 |

在 macOS 上也支持 `Cmd+S` 保存。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面壳 | [Tauri v2](https://tauri.app) |
| 前端 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS |
| 代码编辑器 | CodeMirror 6，通过 `@uiw/react-codemirror` 使用 |
| 代码格式化 | Prettier |
| 状态管理 | Zustand |
| p5 运行时 | 本地打包的 p5 v1 |
| 后端 / 文件 I/O | Rust、`std::fs`、`zip`、`base64` |
| CI / 发布 | GitHub Actions、Node 22、`tauri-apps/tauri-action` |

## 草图存储

应用会把草图保存在 Tauri 应用数据目录中：

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

`meta.json` 保存笔记和文件顺序。旧版单文件 `.js` 草图会在启动时自动迁移为文件夹格式。

常见系统路径：

| 平台 | 草图目录 |
| --- | --- |
| Windows | `%APPDATA%\com.p5jsstudio.app\sketches` |
| macOS | `~/Library/Application Support/com.p5jsstudio.app/sketches` |
| Linux | `~/.local/share/com.p5jsstudio.app/sketches` |

## 开始使用

### 环境要求

- [Node.js](https://nodejs.org) 22 或更新版本。
- [Rust](https://rustup.rs) stable 工具链。
- Windows：Visual Studio Build Tools，需要 C++ 桌面构建工具和 Windows SDK。
- Linux：`libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf`。
- macOS：普通开发不需要额外系统依赖。

### 开发运行

```bash
git clone https://github.com/kergee/P5JS-Studio.git
cd P5JS-Studio

npm ci
npm run tauri dev
```

### 前端构建检查

```bash
npm run build
```

### 生产构建

```bash
npm run tauri build
```

构建产物会输出到：

```text
src-tauri/target/release/bundle/
```

## GitHub Actions

仓库中已经包含 `.github/workflows/build.yml`。

该工作流会构建以下平台的发布文件：

- macOS 通用二进制。
- Windows 安装包。
- Linux AppImage。

有两种触发方式：

1. 打开 GitHub 仓库，进入 **Actions**，选择 **Build & Release**，点击 **Run workflow**。
2. 推送版本标签：

```bash
git tag v1.0.0
git push origin v1.0.0
```

推送匹配 `v*` 的 tag 后，会通过 `tauri-apps/tauri-action` 创建一个草稿版 GitHub Release。

## 使用指南

### 创建草图

1. 在图库中点击 **+ New Sketch**。
2. 在编辑器中编写 p5.js 代码。
3. 点击 **Run** 或按 `Ctrl+Enter` 运行。
4. 点击 **Save** 或按 `Ctrl+S` 保存。

### 使用多文件

点击文件标签栏中的 **+ Add File**。文件会保存在草图文件夹内，并在预览运行时按标签顺序拼接。

### 使用图片

把图片文件放到草图文件夹或共享的 `public` 文件夹，然后使用普通 p5 代码：

```js
function preload() {
  pic = loadImage("pic1.png");
}
```

### 备份草图

使用 **Export ZIP** 备份所有草图文件夹，包括代码、笔记、缩略图和资源文件。使用 **Import ZIP** 可以恢复备份。

## 许可证

MIT
