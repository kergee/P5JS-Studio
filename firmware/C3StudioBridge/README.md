# C3StudioBridge 1.1.0：ESP32-C3 SuperMini USB 通用固件

本固件固定提供硬件接口；画面、游戏规则、颜色和交互由 P5JS Studio 项目的 JS 决定。在下列能力范围内切换项目不需要重新烧录。

用于当前 SuperMini V1601：GPIO9 BOOT 按键、GPIO8 低电平点亮的用户蓝灯、USB Serial/JTAG，以及按需启动的2.4GHz Wi-Fi被动扫描/RSSI采样。它不是所有 ESP32 板型/传感器的万能固件。无外接 GPIO 配置、ADC、Wi-Fi数据传输、蓝牙、CSI人体感知、摄像头、音频或烧录功能；增加尚未支持的硬件能力仍需升级固件。

## 一次安装

Studio 保存作品并断开设备 → Arduino IDE 打开 `C3StudioBridge.ino`（同目录的 `C3WifiMonitor.h` 必须保留）→ ESP32C3 Dev Module、实际端口（本次 COM9）、USB CDC On Boot Enabled、4MB → 上传 → 关闭 IDE → Studio 中导入本固件对应的示例 ZIP，手动连接 115200 并运行。

之后只切换项目、重新连接；无需再打开 IDE。运行或导入示例不自动发送控制指令。识别、开关灯、短闪都由用户在画布或面板操作。固件使用 MIT 许可证。

## 文本协议 studio-c3-usb/1

115200，8N1，无流控。每条命令以 LF 结尾，兼容 CRLF。命令名为区分大小写的 ASCII，SSID参数可用UTF-8，整行最大127字节。超长或含 NUL 的行丢弃到下一换行并返回错误；空行忽略；未知命令不执行，返回 UNKNOWN_COMMAND。USB 断开不缓存历史按键或补发消息。

| 命令 | 回复/作用 |
| --- | --- |
| `PING` | `PONG`，保留连通性检查 |
| `INFO` | JSON：type=info、protocol=studio-c3-usb/1、firmware=1.1.0、board、capabilities |
| `STATUS` | JSON：type=status、pressed、count、led（长亮设定0/1）、pulsing、wifi_monitoring |
| `LED:1` / `LED:0` | 设置蓝灯长亮/灭，取消当前脉冲；回复 `{"type":"ack","ack":"LED","value":1}` 或 value=0 |
| `PULSE:150` | 蓝灯短亮150ms，再恢复长亮设定；范围1～2000ms；回复 `{"type":"ack","ack":"PULSE","ms":150}` |
| `scan` | 异步扫描附近2.4GHz AP，逐行输出 wifi_ap，最后 wifi_scan_done；不登录网络 |
| `con:SSID` | 从最近扫描结果中精确选定唯一SSID，按固定BSSID及信道采样RSSI；无需密码 |
| `con:bssid=02:11:22:33:44:55` | 用实际BSSID明确选择，支持大小写十六进制；适用于同名、隐藏名或列表截断 |
| `stop` | 取消扫描/监测并关闭Wi-Fi，BOOT、LED和PING继续可用 |

## Wi-Fi RSSI

依次发送scan → 等待wifi_scan_done → con:实际SSID。不会调用WiFi.begin加入网络，也不保存密码。使用C3板上Wi-Fi接收信号，数据与命令仍通过USB串口传输。

```json
{"event":"wifi_ap","ssid":"Office","bssid":"02:11:22:33:44:55","channel":6,"rssi":-45}
{"event":"wifi_scan_done","total":1,"shown":1,"truncated":false}
{"type":"ack","ack":"con","ssid":"Office","bssid":"02:11:22:33:44:55","channel":6}
{"event":"wifi_rssi","ssid":"Office","bssid":"02:11:22:33:44:55","channel":6,"available":true,"rssi":-46,"ms":12000}
```

上方为虚构示意数据，不是办公室实测。约500ms启动一次目标信道被动扫描，实际间隔受扫描耗时影响；没有收到目标时available=false、rssi=null，不改测同名AP。AP换信道后需要重新scan选择。扫描异步执行，结果每循环最多输出一行，使按键、蓝灯和PING继续被轮询。

SSID重复返回SSID_AMBIGUOUS_USE_BSSID，改用con:bssid=实际地址。最多缓存64个AP，超出时truncated=true，按SSID选择会拒绝，必须指定已列出的BSSID。隐藏或非UTF-8名称用BSSID选择；JSON输出转义特殊字符和无效UTF-8字节。扫描进行中返回WIFI_BUSY_TRY_AGAIN，可等完成后重试，或stop取消。

Wi-Fi默认关闭，只在显式scan/con后启动；stop或检测到主机串口断开时停止。不自动恢复采样。SSID/BSSID和选择结果只驻留RAM，不写入meta，不连接云端。RSSI变化受环境影响，本版不判断人经过，也不实现CSI。

BOOT 消抖25ms；按下/松开各发送一条消息：

```json
{"event":"button","button":"BOOT","pressed":true,"count":1}
{"event":"button","button":"BOOT","pressed":false,"count":1}
```

count 仅在稳定按下沿加一，长按不重复。默认按下时蓝灯反馈150ms（若已长亮则保持亮），无需主机命令；短间隔触发重新计时，不排队补闪。重启后计数清零、灯灭。程序启动后再按 BOOT；RST 只负责重启，按住 BOOT 重启进入下载模式。

LED 命令不持久化，检测到 USB 主机串口断开时清除未完成的输入并熄灭命令控制的 LED；按键反馈仍可独立工作。具体驱动是否将关闭端口反映为 CDC 断开，需要当前板子实测。应用重新运行而不关闭连接时，长亮设定保留。开灯/关灯界面以板端 ACK 更新，不以发送完成冒充实际反馈。

## 示例与兼容

- `ESP32-04-C3通用固件烟花`：BOOT 事件产生烟花，蓝灯有硬件反馈。
- `ESP32-05-C3通用固件灯光`：点击画布识别固件、开关蓝灯、短闪；BOOT 触发画面脉冲和计数。
- `ESP32-06-C3无线信号波形`：串口发送scan/con选择目标，绘制RSSI波形，同时保留BOOT烟花。
- 04/05/06 ZIP 包内提供同一份1.1.0固件源文件。一次烧录后可切换这三个项目；按键消息及原有指令兼容1.0.0。
- 旧 `ESP32-03-C3按键烟花` 的专用固件发 `event=firework`；通用固件发 `event=button`。旧项目不会自动转换，请使用新的04示例。PING 测试仍兼容。GPIO18 LED 外接示例有不同接线，不应混用。
- 不改 Studio 应用、meta.json 格式、串口接口或版本号，不发布新安装包。

1.0.0验证记录在本地artifacts/c3-universal-bridge，1.1.0在artifacts/c3-wifi-monitor。源码编译/主机模拟和画面检查不代表已经烧录、真实无线扫描或按键/蓝灯共存通过验收；实机结果尚待用户测试。

GPIO 依据：[Apache NuttX SuperMini 说明](https://nuttx.incubator.apache.org/docs/latest/platforms/risc-v/esp32c3/boards/esp32c3-supermini/index.html)。第三方板型存在差异，目标为已连接的 SuperMini V1601。
