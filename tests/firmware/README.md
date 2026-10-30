# C3StudioBridge 主机测试

`C3StudioBridge.test.cpp` 包含实际固件 `.ino`，用此目录的 Arduino.h 替代引脚、USB 和时钟。需要 C++17 编译器；只在主机测试时把本目录加入 include 搜索路径，切勿添加到真实 Arduino 固件构建中。

例如在 Visual Studio x64 Native Tools 命令行、仓库根目录运行（输出目录须已存在）：

```text
cl /EHsc /std:c++17 /DCONFIG_IDF_TARGET_ESP32C3=1 /DARDUINO_USB_CDC_ON_BOOT=1 /I tests\firmware /Foartifacts\c3-universal-bridge\firmware-test.obj /Feartifacts\c3-universal-bridge\firmware-test.exe tests\firmware\C3StudioBridge.test.cpp
artifacts\c3-universal-bridge\firmware-test.exe
```

54项检查覆盖原有28项串口、灯光、按键回归，以及Wi-Fi默认关闭、异步被动扫描、扫描时PING/BOOT仍工作、重复SSID拒绝、BSSID/信道锁定、无目标用null、stop/断线停止、超时恢复、64项截断、UTF-8及JSON转义。WiFi.h/esp_wifi.h同样为主机模拟，不参与Arduino真实编译。测试并未访问COM端口或无线硬件，也不能证明真实开发板引脚/驱动/灯光/扫描正常。
