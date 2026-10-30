# 画布控制 LED / Canvas → LED

材料：参考 ESP32 开发板、数据 USB 线、外接 LED、330Ω 电阻及跳线。
接线：GPIO18 → 330Ω 电阻 → LED 阳极（长脚）；LED 阴极 → GND。不依赖板载 LED 的型号和极性。

协议：画布点击发送 `LED:1\n` / `LED:0\n`；固件设置 GPIO 后回传 `{"ack":"LED","value":1}` / `{"ack":"LED","value":0}` 加换行。
画面仅在收到 ACK 后更新确认状态；发送成功只说明串口写入完成。ACK 只说明固件执行命令，LED 是否实际点亮仍需现场观察。3 秒无 ACK 显示超时，可重试。固件命令缓冲为 63 字节，超长丢弃到下一行，未知命令回传 error JSON。

Materials: reference board, data USB cable, external LED, 330Ω resistor and jumpers. GPIO18 → resistor → LED anode; cathode → GND. Click sends LED:1/LED:0, firmware replies with a JSON ACK. Canvas state changes only after ACK; visually inspect the physical LED separately.

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
