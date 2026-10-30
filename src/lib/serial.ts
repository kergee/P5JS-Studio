import { invoke } from "@tauri-apps/api/core";
export interface SerialPort { name: string; label: string }
export interface SerialSession { id: string; port: string; baudRate: number }
export interface SerialEvent { owner: string; session: string; connected: boolean; lines: string[]; error: string | null }
export const serialApi = {
  ports: () => invoke<SerialPort[]>("serial_list_ports"),
  connect: (owner: string, port: string, baudRate: number) => invoke<SerialSession>("serial_connect", { owner, port, baudRate }),
  disconnect: (owner: string, release = false) => invoke<void>("serial_disconnect", { owner, release }),
  writeLine: (owner: string, session: string, text: string) => invoke<void>("serial_write_line", { owner, session, text }),
};

export const serialText = {
  en: {
    more: "More tools", title: "ESP32", debug: "Debug", port: "Port", refresh: "Refresh ports", baud: "Baud rate",
    connect: "Connect", disconnect: "Disconnect", connected: "Connected", disconnected: "Disconnected", connecting: "Connecting…",
    pause: "Pause display", resume: "Resume display", clear: "Clear", send: "Send", input: "Send one line", collapse: "Collapse tools", expand: "Expand tools",
    resize: "Resize tools panel", saveFirst: "Save the project before connecting.", noPorts: "No ports found", waiting: "Waiting for data…",
    hint: "USB serial · 8N1 · no flow control · software prototype; hardware validation pending",
    errors: { invalid_utf8: "Received invalid UTF-8; line skipped.", line_too_long: "A line may contain at most 8192 UTF-8 bytes.", single_line_only: "Send one line without newline characters.", not_connected: "Device is not connected.", port_busy: "A serial connection is already active.", port_not_found: "Port not found. Refresh and choose a port.", project_closed: "This project session has ended.", invalid_baud: "Enter a baud rate between 1 and 5000000.", send_queue_full_or_closed: "Send queue is full or disconnected.", send_timeout_or_disconnected: "Sending timed out or the device disconnected.", device_disconnected: "Device disconnected.", windows_only: "USB serial is available on Windows only." },
  },
  "zh-CN": {
    more: "更多工具", title: "ESP32", debug: "调试", port: "串口", refresh: "刷新串口", baud: "波特率",
    connect: "连接", disconnect: "断开", connected: "已连接", disconnected: "未连接", connecting: "连接中…",
    pause: "暂停显示", resume: "继续显示", clear: "清空", send: "发送", input: "发送一行文本", collapse: "折叠工具区", expand: "展开工具区",
    resize: "调整工具区高度", saveFirst: "请先保存项目，再连接设备。", noPorts: "未发现串口", waiting: "等待接收数据…",
    hint: "USB 串口 · 8N1 · 无流控 · 软件原型，待实机验证",
    errors: { invalid_utf8: "收到无效 UTF-8，已跳过该行。", line_too_long: "单行最多 8192 个 UTF-8 字节。", single_line_only: "请输入不含换行的一行文本。", not_connected: "设备未连接。", port_busy: "已有串口连接，请先断开。", port_not_found: "串口不存在，请刷新后重新选择。", project_closed: "该项目会话已结束。", invalid_baud: "请输入 1～5000000 的波特率。", send_queue_full_or_closed: "发送队列已满或设备已断开。", send_timeout_or_disconnected: "发送超时或设备已断开。", device_disconnected: "设备已断开。", windows_only: "USB 串口首期仅支持 Windows。" },
  },
};
export function serialError(error: unknown, language: "en" | "zh-CN"): string {
  const message = (error instanceof Error ? error.message : String(error)).replace(/^Error: /, "");
  const [key, ...rest] = message.split(": ");
  const errors: Record<string, string> = serialText[language].errors;
  if (errors[key]) return errors[key];
  const prefix: Record<string, string> = language === "zh-CN" ? { open_failed: "无法打开串口，请检查设备、驱动或其他程序是否占用", read_failed: "读取失败，连接已关闭", write_failed: "发送失败，连接已关闭" } : { open_failed: "Cannot open port; check device, driver and other applications", read_failed: "Read failed; connection closed", write_failed: "Write failed; connection closed" };
  return prefix[key] ? `${prefix[key]}${rest.length ? `: ${rest.join(": ")}` : ""}` : message;
}
