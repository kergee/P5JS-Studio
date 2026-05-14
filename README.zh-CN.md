# P5JS Studio

[English](README.md) | [简体中文](README.zh-CN.md)

P5JS Studio 是一个本地桌面版 [p5.js](https://p5js.org) 创意编程 IDE，基于 Tauri、React、TypeScript 和 CodeMirror 构建。它可以离线编写、运行、整理、调试和备份草图，内置图库、文件夹式草图管理、实时预览、多文件草图、笔记、缩略图、本地图片资源、代码格式化、p5 补全提示、调试输出、预览缩放，以及亮色/暗色主题。

## 功能

### 图库

- 文件管理器式图库，支持文件夹、面包屑导航和草图卡片。
- 支持多层文件夹，可按班级、主题、作业或项目整理草图。
- 包含 `meta.json` 的文件夹会被识别为草图；没有 `meta.json` 的文件夹会作为分类目录。
- 从编辑器返回图库时，会保留当前所在文件夹和面包屑路径。
- 点击运行草图 1.5 秒后自动截取缩略图。
- 草图卡片显示笔记摘要。
- 支持把 `.js` 文件拖进窗口直接导入。
- 支持通过文件选择器上传单个 `.js` 草图。
- 支持在文件夹之间移动草图。
- 支持重命名文件夹和删除空文件夹。
- 支持把所有草图导入/导出为 `.zip` 压缩包，并保留完整目录结构。
- 可直接从应用中打开本地草图存储目录。
- 支持英文 / 简体中文界面切换。
- 内置 Help 帮助面板，说明主要功能和快捷键。

### 编辑器

- 左侧 CodeMirror 编辑器，右侧 p5 实时预览。
- 支持多文件草图，可通过文件标签栏添加额外 `.js` 文件。
- 同一个草图内的所有文件会按标签顺序拼接运行，并共享同一个 p5 全局作用域。
- 每个草图都有独立笔记面板。
- 点击工具栏里的草图名可以重命名。
- 点击运行时，会先自动保存当前草图文件和笔记，再启动预览。
- 提供轻量 p5 补全提示，覆盖常用函数、变量、常量和生命周期模板。
- 提供轻量编辑器诊断，可提示语法错误和常见 p5 函数拼写错误。
- 支持用 Prettier 格式化当前文件，可点击工具栏按钮或使用 `Shift+Alt+F`。
- 支持调整编辑器字体大小：`Ctrl` + 鼠标滚轮、`Ctrl` + `+`、`Ctrl` + `-`，或使用工具栏按钮。
- 支持亮色和暗色 UI 主题，并会记住上次选择。

### 预览与调试

- 预览 iframe 会在隔离沙箱中运行草图。
- 大尺寸画布可以通过滚动条查看。
- 预览缩放控件可以缩小超大画布，也可以一键恢复到 100%。
- Debug Console 会捕获 `console.log`、`console.warn` 和 `console.error`。
- 运行时错误、语法错误和未处理的 Promise 异常会显示在 Debug Console 中。
- 缩略图会在运行草图后自动截取保存。

### 本地资源

图片可以放在草图目录中，并用普通 p5 路径加载：

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
  particles/
    my-sketch/
      meta.json
      sketch.js
      utils.js
      pic1.png
      thumbnail.png
  class-1/
    student-1/
      meta.json
      sketch.js
  public/
    shared-image.png
```

`meta.json` 保存笔记和文件顺序。任何包含 `meta.json` 的文件夹都会被识别为草图文件夹；不包含 `meta.json` 的文件夹会作为分类目录。旧版单文件 `.js` 草图会在启动时自动迁移为文件夹格式。

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
git tag v1.2.4
git push origin v1.2.4
```

推送匹配 `v*` 的 tag 后，会通过 `tauri-apps/tauri-action` 创建一个草稿版 GitHub Release。

### Release Notes 和变更日志

当前 workflow 会创建一个带下载说明的草稿版 GitHub Release。Action 构建完成后，可以进入 GitHub 的 Releases 页面编辑草稿 Release，然后点击 **Generate release notes**，让 GitHub 根据合并记录和提交记录自动生成一版变更说明。

一个实用发布流程是：

```bash
git tag v1.2.4
git push origin v1.2.4
```

然后打开 **GitHub > Releases**，编辑草稿 Release，点击 **Generate release notes**，检查内容后发布。

如果还想在仓库里保留独立变更日志，可以维护一个 `CHANGELOG.md`，把检查过的 release notes 复制进去。后续如果想更自动化，可以采用 Conventional Commits，再接入 `release-please` 或 `standard-version` 这类工具。

## 使用指南

### 创建草图

1. 在图库中点击 **+ New Sketch**。
2. 在编辑器中编写 p5.js 代码。
3. 点击 **Run** 或按 `Ctrl+Enter` 运行。运行前会先自动保存草图。
4. 如果只想保存但不运行，可以点击 **Save** 或按 `Ctrl+S`。

### 使用多文件

点击文件标签栏中的 **+ Add File**。文件会保存在草图文件夹内，并在预览运行时按标签顺序拼接。

### 使用文件夹整理

点击 **New Folder** 创建分类目录，然后在目录里新建草图。面包屑导航可以回到上级目录。如果从子目录打开草图，再返回图库，会继续停留在原来的子目录。草图卡片上的 **Move** 可以把草图移动到其他文件夹。

### 使用图片

把图片文件放到草图文件夹或共享的 `public` 文件夹，然后使用普通 p5 代码：

```js
function preload() {
  pic = loadImage("pic1.png");
}
```

### 备份草图

使用 **Export ZIP** 备份所有草图文件夹，包括代码、笔记、缩略图和资源文件。使用 **Import ZIP** 可以恢复备份。

### 调试草图

可以在 p5 代码中使用 `console.log(...)`，然后查看预览区底部的 Debug Console。语法错误、常见 p5 函数拼写错误、运行时错误和异步错误也会显示在那里。

## Roadmap

- 支持可选 p5 运行时切换，包括未来的 p5 v2 兼容模式。
- 更自动化的 release notes / 变更日志流程。
- 更完整的编辑器诊断能力。
- 可配置的自动保存行为，以及更清晰的保存状态提示。

## 许可证

MIT
