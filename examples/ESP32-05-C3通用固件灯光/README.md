# 同一通用固件：画布控制蓝灯

使用包内 `firmware/C3StudioBridge/C3StudioBridge.ino`；它与04通用固件烟花包中的固件完全相同。只需上传一次 C3StudioBridge，之后更换项目无需再烧录。

上传设置：ESP32C3 Dev Module，实际端口，USB CDC On Boot Enabled，4MB。上传前 Studio 断开；完成后关闭 Arduino IDE。

导入 ZIP → 更多工具/ESP32 → 手动连接当前端口、115200 → 运行。点击“识别固件”应显示 C3StudioBridge 的1.1.0版本；点击开灯、关灯、短闪按钮控制板载 GPIO8 蓝灯。面板也可直接发送 INFO、LED:1、LED:0、PULSE:150。按 BOOT 则在画布显示一圈脉冲、计数增加，板载灯提供短闪反馈。

打开/运行不会自动发送指令。图中的“长亮设定”只在收到板端ACK后更新；短闪和BOOT反馈不改变长亮设定。若长亮设为开，短闪完成后恢复长亮；检测到主机USB串口断开时固件会清除长亮设定，具体驱动行为仍需实测。

软件检查不能替代真实灯光、按键和项目切换实机验证。原始固件备份不在此包中。代码为匿名原创MIT示例。详细协议见包内 firmware/C3StudioBridge/README.md。
