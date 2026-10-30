# ESP32-C3 SuperMini：BOOT 按键烟花

匿名原创 MIT 教学示例。电脑运行 p5.js；开发板读取 BOOT 按键并发送 USB 文本消息，同时短闪板载蓝灯。无需额外接线，无声音、无 Wi-Fi，仅控制板载用户灯 GPIO8。

## 两个按键

- **BOOT**：GPIO9，按下为低电平。程序正常启动后作为用户按键。
- **RST / RESET**：重启芯片，不是本例的互动按键。
- **蓝色用户灯**：GPIO8，低电平点亮。每次按下 BOOT 亮约 150ms 后熄灭；长按不连闪。采用 millis 计时，不为闪灯阻塞按键或串口；快速再次按下会从最近一次触发重新计时。即使串口未连接，按键也会闪灯。默认启动保持灯灭。
- 运行时轻按 BOOT，每按一次发射一朵烟花，长按不连续发射。不要按住 BOOT 同时重启，否则进入下载模式；此时松开 BOOT，再单独按 RST。

针脚依据：[Apache NuttX 的 SuperMini V1601 说明](https://nuttx.incubator.apache.org/docs/latest/platforms/risc-v/esp32c3/boards/esp32c3-supermini/index.html)。SuperMini 为第三方板型；本例目标是已识别的 ESP32-C3 SuperMini V1601，按键实际行为仍需用户实机验证。

## 1. 上传固件

1. 在 P5JS Studio 的 ESP32 面板点“断开”，释放 COM 端口。保存当前作品。
2. Arduino IDE 打开 `firmware/C3ButtonFireworks/C3ButtonFireworks.ino`。
3. 选择 **ESP32C3 Dev Module**、开发板当前端口（本次为 COM9）、**USB CDC On Boot → Enabled**、**Flash Size → 4MB (32Mb)**。其他选项保持默认。
4. 点击左上角“→”上传。完成并校验成功后，松开 BOOT，必要时单独按一下 RST。
5. 可在串口监视器选择 115200、New Line，发送 PING 应收到 PONG；轻按 BOOT 应收到下文 JSON。随后关闭 IDE，释放串口。

本例不自动烧录、擦除或连接设备。上传会替换旧程序；原始固件备份单独保存在本机，不随示例打包。

## 2. 在 Studio 中运行

1. 图库“导入项目 ZIP”，选择同名 ZIP 包；打开项目。也可在现有草图里用本目录 `sketch.js` 的完整内容替换代码并保存。
2. 更多工具 → ESP32，选实际端口、115200，点击连接，然后运行。
3. 轻按 BOOT：板载蓝灯短闪，计数增加，彩色光点升空后爆开。松开再按可叠加烟花；长按只计一次。蓝灯反馈发生在按键触发时，屏幕烟花随后升空、爆开，两者不保证精确同时爆发。
4. 点击画布仅发送 PING 检查连通性，不会产生模拟烟花。未收到 firework 消息时画面不自动发射。
5. 重新运行清空画面和本次接收计数；板端计数在重启板子后归零。断线后手动重连。

## 通信格式

115200，UTF-8，每条消息以 LF 结束；接收兼容 CRLF。输入最长 127 字节，超长行整行丢弃并报错，下一行恢复。

按键经 25ms 稳定消抖，仅在按下沿发送：

```json
{"event":"firework","count":1}
```

`count` 是板子本次上电后的按下次数；USB 未连接时仍扫描按键，但不缓存/补发历史事件。

面板可发送 `PING` → `PONG`；发送 `STATUS` → `{"event":"status","button":1,"count":1}`，其中 button=1 为松开、0 为按下。其他非空输入回显 `ECHO: 原文字`。status 和 PONG 不触发烟花。

## 验证边界

固件编译、画面和模拟串口事件可在软件环境验证；真实按键、USB 端到端与长按/重复运行验收需用实际板子完成。软件验证不能替代实机结果。正式应用版本保持不变。

本次软件检查：Arduino-ESP32 3.3.12、ESP32C3 Dev Module、USB CDC Enabled、4MB 配置编译通过；画面在本地 p5.js 运行并检查串口模拟事件、无效消息过滤、点击仅发 PING、断线不发送及窄窗口布局。尚未上传此版本固件，也没有真实按键烟花的验收结果。

蓝灯修订沿用 GPIO8 低电平点亮的 SuperMini V1601 接法，编译后需要重新上传固件；p5.js 草图和 JSON 协议不变。蓝灯实际接法、短闪和按键烟花联动仍待当前开发板实测。
