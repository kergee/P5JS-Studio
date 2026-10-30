# 桌面图标与鸿蒙统一

桌面端使用与鸿蒙原生图标同一份矢量图形：暖白底 `#FAF8F6`、深灰 `#292832` 和粉色 `#EA3F73` 的 p5 标记。

- `app-icon.svg`：从鸿蒙 AppScope 的 `app_icon.svg` 同步而来，保留前景/背景合成后的路径和布局，不使用参考图片重新描摹。
- `app-icon.png`：1024×1024 主图。
- `src-tauri/icons/`：Tauri 生成的桌面 PNG、ICO、ICNS 与 Windows 标志尺寸；Windows 程序、窗口/任务栏和安装包由这些配置引用图标。NSIS installerIcon 显式引用 icon.ico，build.rs 跟踪 icons 目录变更，确保资源编译不会继续复用旧图标。
- 重新生成：在仓库运行 `pwsh -NoProfile -File scripts/prepare-desktop-icons.ps1`。临时移动端格式仅留在忽略的 artifacts 目录，不修改鸿蒙工程。

2026-10-30 同步时，SVG SHA256 为 `53f7621c02efc177325b8b6b960244cfc3afe6f25373b7050ca3be5164820c61`；已核对与鸿蒙当前复合图标逐字节一致。Windows ICO 包含 16、24、32、48、64、256 像素图像。

安装后 Windows 可能短暂显示旧的图标缓存；文件资源校验与桌面缓存显示是两项不同的验收结果。本次不清理用户图标缓存，也不操作桌面。
