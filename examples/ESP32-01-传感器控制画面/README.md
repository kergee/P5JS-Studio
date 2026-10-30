# 传感器控制画面 / Sensor → canvas

材料：参考 ESP32 开发板、数据 USB 线、10kΩ 电位器及跳线。
接线：电位器两端接 3V3 / GND，中间滑动端接 GPIO34（ADC 输入）。

协议：固件每 50ms 发一行十进制整数 `0`～`4095`，例如 `2048\r\n`。p5.js 验证范围后将数值映射为圆的大小和颜色，不向硬件发送命令。
未收到数据时显示固定中间值，并明确标记为预览；不能用动画证明传感器已经工作。

Materials: reference board, data USB cable, 10kΩ potentiometer, jumper wires. Ends → 3V3/GND; wiper → GPIO34. One integer (0–4095) every 50 ms controls circle size and color.

## 使用 / Usage

这是软件原型配套的匿名教学项目，尚未经过真实开发板验证。参考板为 **ESP32-DevKitC / ESP32-WROOM-32**；不是所有 C3、S3 或其他开发板的通用接线表。请按手中开发板的引脚图调整固件常量。

1. 用外部 Arduino IDE（安装 Espressif Arduino-ESP32 支持）打开 firmware 子目录中的同名 .ino 文件，选择实际板型和端口，编译并上传。Studio 不编译、烧录或复位设备。
2. 关闭 IDE 的串口监视器，避免占用端口。使用可传输数据的 USB 线连接 Windows。
3. 在 Studio 导入本目录对应的 ZIP，打开项目并运行。在“更多工具 / More tools → ESP32”手动选择端口、115200 并连接。
4. 首次开面板会在隔离的预览中重新载入上一次运行的代码；仅连接后才会有设备数据。折叠、切到调试页、重新运行不会断开；回图库、成功保存重命名或关闭软件会断开。拔线后需手动重连。
5. 将项目导出并重新导入，检查 JS、笔记及 firmware/README.md 文件仍在；没有设备也可以打开和运行画面。

Software prototype, not hardware-validated. Prepare firmware externally using the actual board definition, close other serial monitors, import the ZIP and manually connect from More tools → ESP32 at 115200. No auto-connect, reset or flashing. These pin numbers target the classic ESP32-WROOM-32 reference board; adapt them for other boards.

电路使用开发板 **3V3** 和 GND；接线时先断开 USB 电源。不要将 5V 信号接入 GPIO。串口为 115200 / 8N1 / 无流控，UTF-8 文本行，接收 LF 或 CRLF，发送由 Studio 追加 LF。Studio 单行上限 8192 字节。示例固件采用更小、固定格式。

板型参考：https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html
Arduino 串口文档：https://docs.espressif.com/projects/arduino-esp32/en/latest/api/serial.html
