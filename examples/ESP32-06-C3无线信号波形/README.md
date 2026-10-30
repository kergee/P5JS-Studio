# ESP32-C3：Wi-Fi RSSI 波形，保留 BOOT 烟花

使用包内 C3StudioBridge 1.1.0 固件。一次上传后，04烟花、05灯光和本项目均使用同一固件。

## 使用

1. Studio 断开串口，Arduino IDE 打开整个 firmware/C3StudioBridge 文件夹中的 C3StudioBridge.ino。旁边的 C3WifiMonitor.h 必须保留，不能只复制单个 .ino。
2. ESP32C3 Dev Module、实际端口、USB CDC On Boot Enabled、4MB；上传后关闭 IDE。
3. Studio 导入本 ZIP，更多工具 → ESP32 → 手动连接实际端口、115200 → 运行。
4. 在 ESP32 面板发送框发送 `scan`，等接收区出现 `wifi_scan_done`。`wifi_ap` 行包含 ssid、bssid、channel、rssi。
5. 发送 `con:办公室WiFi`（替换成扫描到的完整名称；大小写、空格均按原样，不额外加引号）。这只锁定监测目标，不登录网络，不需要密码。
6. 若名称重复，固件返回 SSID_AMBIGUOUS_USE_BSSID；改发送 `con:bssid=02:11:22:33:44:55`，替换成列表中实际BSSID。
7. 画面绘制最近30秒的接收样本波形。信号丢失会留空，5秒没有新样本提示等待；停止命令为 `stop`。

也可在原来的04烟花项目运行时发送相同命令，在串口接收区查看RSSI；06额外提供波形。按下 BOOT 仍产生烟花和蓝灯短闪，长按不重复；`PING` 仍返回 `PONG`。本项目启动和运行不自动发送指令。

## 采样边界

仅扫描2.4GHz，Wi-Fi默认关闭，scan/con由用户启动；约每500ms发起一次目标信道的被动扫描，实际间隔受扫描耗时影响。不是高速CSI采样，也不把RSSI阈值当成人体检测。Wi-Fi用于接收AP信号，C3与电脑之间继续通过USB串口传数据。

一次列表最多缓存64个AP，超过时会标记truncated且要求用BSSID选择。隐藏或非UTF-8名称可用BSSID选择。AP换信道/离线时报告available=false和rssi=null，需重新scan确认目标；不自动切换同名AP。stop或检测到USB串口关闭时停止采样；重新连接不自动恢复。

SSID/BSSID只在设备RAM和当前串口会话中使用，不写入项目meta、不保存密码、也不发往云端。ZIP含匿名示例及固件，不包含真实办公室扫描结果。图中纵轴显示-100～-20dBm，超出范围的绘图点限制在边界，数字仍显示原始值；横轴为样本到达电脑的时间。

软件编译/模拟结果不能替代真实办公室扫描、RSSI、蓝灯和按键共存的实机验证。代码MIT。详细协议见 firmware/C3StudioBridge/README.md。
