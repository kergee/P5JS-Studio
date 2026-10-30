# 同一通用固件：BOOT 按键烟花

使用包内 `firmware/C3StudioBridge/C3StudioBridge.ino`。它与05通用固件灯光包中的固件完全相同，只上传一次，之后更换这两个项目无需再次烧录。

上传设置：ESP32C3 Dev Module、实际端口、USB CDC On Boot Enabled、4MB。上传前 Studio 断开；完成后关闭 Arduino IDE。

导入 ZIP → 更多工具/ESP32 → 手动连接实际端口、115200 → 运行。程序启动后轻按 BOOT：蓝灯短闪，烟花升空；长按不重复发射。RST 用于重启，勿在运行时按住 BOOT 同时重启。

本项目识别 `{"event":"button","button":"BOOT","pressed":true,"count":1}`，不对松开事件、PONG 或其他消息发射烟花。点击画布仅发送 PING 检查连接，不模拟按键。导入、打开、运行不会自动发送指令。计数和动画是电脑上的项目逻辑，固件只报告按键和提供灯光接口。

旧03烟花的专用固件使用 event=firework；请把板子升级为 C3StudioBridge 后运行本项目。旧03项目保留原样，两个版本不能直接混用。

软件检查不能替代真实按键和两个项目来回切换的实机验证。代码为匿名原创MIT示例。原始固件备份不在此包中。详细协议见 firmware/C3StudioBridge/README.md。
