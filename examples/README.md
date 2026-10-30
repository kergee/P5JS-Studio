# 课堂演示项目

这里的 ABC、DEF、GHI 是虚构代号，不含真实学生信息。SVG 图案与 WAV 声音是为本仓库生成的演示资源，按仓库 MIT 许可证使用。

| 项目 | p5.js | 演示内容 |
| --- | --- | --- |
| ABC-多文件粒子 | 1.11.13 | utils.js 先加载，sketch.js 使用其函数绘制动画 |
| DEF-本地图片与声音 | 1.11.13 | preload 加载 assets/card.svg 和 assets/chime.wav |
| GHI-p5js2异步资源 | 2.3.4 | async setup 等待本地图片及声音加载 |

在图库创建“演示班 / 第一次”，打开 **导入项目 ZIP**，选择这里的三个 ZIP，再运行各项目。图片和声音加载成功会在调试台输出尺寸及声音时长。声音需要点击画布后播放，以满足浏览器的音频手势要求。

目录是可编辑源文件，ZIP 是相同内容的提交样例。ZIP 根目录有 meta.json，files 数组规定 JS 的拼接顺序。可导出、在另一分类目录导入，再验证笔记、版本与资源是否保留。

这些是 P5JS Studio 项目包，不能用来证明任意 HTML 包都能自动转换。更换 p5.js 大版本可能需要改写 preload 或其他 API。

## ESP32 USB 原型示例

- [传感器控制画面](ESP32-01-传感器控制画面/README.md)：电位器数值控制圆形大小与颜色。[导入 ZIP](ESP32-01-传感器控制画面.zip)。
- [画布控制 LED](ESP32-02-画布控制LED/README.md)：点击发送指令，收到固件 JSON ACK 后更新画面。[导入 ZIP](ESP32-02-画布控制LED.zip)。

均为匿名、MIT 教学代码，无真实学生资料。每包包括 JS、meta.json、接线说明和 firmware/*.ino；固件用外部工具准备。参考板为经典 ESP32-DevKitC / WROOM-32，其他板型需调整引脚。当前未编译固件、未实机验收，仅为软件原型示例。ZIP 与源目录内容一致；不增加串口元数据，不自动连接设备。

- [ESP32-C3 SuperMini 按键烟花](ESP32-03-C3按键烟花/README.md)：使用 BOOT（GPIO9）触发 p5.js 烟花，并短闪板载蓝灯（GPIO8），无外部接线。[导入 ZIP](ESP32-03-C3按键烟花.zip)。此例专门面向 C3，与上面两个经典 ESP32 示例的引脚不同；固件编译及画面软件检查通过，真实按键和蓝灯验收待完成。保留 PING/PONG，不自动连接或烧录。

## 一次烧录，切换两个项目

[C3StudioBridge 通用固件](../firmware/C3StudioBridge/README.md) 报告 BOOT 按下/松开，提供蓝灯开关、短闪，以及1.1.0新增的按需Wi-Fi扫描/RSSI指令；新增尚未支持的传感器仍需升级固件。

- [04-C3通用固件烟花](ESP32-04-C3通用固件烟花/README.md)：[导入 ZIP](ESP32-04-C3通用固件烟花.zip)。
- [05-C3通用固件灯光](ESP32-05-C3通用固件灯光/README.md)：[导入 ZIP](ESP32-05-C3通用固件灯光.zip)。
- [06-C3无线信号波形](ESP32-06-C3无线信号波形/README.md)：[导入 ZIP](ESP32-06-C3无线信号波形.zip)。发送scan、con:SSID开始被动RSSI采样，stop停止，BOOT烟花和PING继续保留。

三包内固件与 firmware/C3StudioBridge 的源文件一致，包含同目录C3WifiMonitor.h。真实烧录、Wi-Fi扫描、按钮、蓝灯及项目切换尚待验收。旧03专用固件和项目保留原样；04/05/06使用通用按键协议，不能混用旧03固件。
