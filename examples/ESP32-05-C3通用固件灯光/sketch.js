// MIT. Same C3StudioBridge firmware as the fireworks project.
let ledSetting = null;
let buttonCount = 0;
let ripple = 0;
let hint = '先连接 ESP32 面板，再点击下方按钮';
let waiting = null;
let waitTimer;
let controls = [];

function setup() {
  createCanvas(Math.max(260, Math.min(windowWidth, 540)), 360);
  pixelDensity(1);
  textFont('sans-serif');
  if (typeof studioSerial === 'undefined') {
    hint = '先打开“更多工具 → ESP32”，再运行';
    return;
  }
  studioSerial.onLine((line) => {
    let data;
    try { data = JSON.parse(line); } catch (_) { return; }
    if (!data) return;
    if (data.event === 'button' && data.button === 'BOOT' && data.pressed === true) {
      buttonCount++;
      ripple = 1;
    }
    if (data.type === 'info' && waiting?.command === 'INFO') {
      finish(data.protocol === 'studio-c3-usb/1' ? '已识别通用固件 ' + data.firmware : '固件协议不匹配');
    }
    if (data.type === 'ack' && waiting) {
      if (data.ack === 'LED' && waiting.command === 'LED:' + data.value && [0, 1].includes(data.value)) {
        ledSetting = data.value;
        finish('开发板确认：蓝灯' + (data.value ? '长亮' : '熄灭'));
      } else if (data.ack === 'PULSE' && waiting.command === 'PULSE:' + data.ms) {
        finish('开发板确认：短闪 ' + data.ms + 'ms');
      }
    }
    if (data.type === 'error' && waiting) finish('板端错误：' + data.code);
  });
}

function finish(message) {
  clearTimeout(waitTimer);
  waiting = null;
  hint = message;
}

function draw() {
  background('#0c1427');
  const connected = typeof studioSerial !== 'undefined' && studioSerial.connected;
  if (!connected) {
    ledSetting = null;
    if (waiting) finish('连接已断开，请手动重连');
  }
  noStroke();
  fill(connected ? '#9bffc3' : '#ffb86b');
  textSize(18);
  text('C3 · 通用固件灯光', 16, 30);
  fill('#a7b9d6');
  textSize(12);
  text((connected ? '已连接' : '未连接') + ' · 收到 BOOT 按下 ' + buttonCount + ' 次', 16, 53);
  if (ripple > 0) {
    noFill();
    stroke(122, 231, 245, ripple * 180);
    strokeWeight(2);
    circle(width / 2, 133, 90 + (1 - ripple) * 100);
    ripple = Math.max(0, ripple - Math.min(deltaTime, 50) / 800);
  }
  noStroke();
  fill(ledSetting === 1 ? '#71b9ff' : '#25344e');
  circle(width / 2, 133, 74);
  fill('#dce8fc');
  textAlign(CENTER);
  text('长亮设定：' + (ledSetting === null ? '未知' : ledSetting ? '亮' : '灭'), width / 2, 194);
  textAlign(LEFT);
  controls = [
    {label:'识别固件', command:'INFO'}, {label:'开灯', command:'LED:1'},
    {label:'关灯', command:'LED:0'}, {label:'短闪一下', command:'PULSE:150'}
  ].map((button, index) => ({...button, x:16 + (index % 2) * ((width - 32) / 2 + 4),
    y:215 + Math.floor(index / 2) * 42, w:(width - 40) / 2, h:34}));
  for (const button of controls) {
    fill(connected && !waiting ? '#234466' : '#1c2a41');
    rect(button.x, button.y, button.w, button.h, 7);
    fill('#edf3ff');
    textAlign(CENTER, CENTER);
    text(button.label, button.x + button.w / 2, button.y + button.h / 2);
  }
  textAlign(LEFT, BASELINE);
  fill('#afc3df');
  text(hint, 16, 318, width - 32, 35);
}

async function mousePressed() {
  if (typeof studioSerial === 'undefined' || !studioSerial.connected || waiting) return;
  const button = controls.find(b => mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h);
  if (!button) return;
  waiting = {command:button.command};
  hint = '等待开发板确认…';
  waitTimer = setTimeout(() => finish('未收到确认：请检查是否上传 C3StudioBridge'), 3000);
  try { await studioSerial.writeLine(button.command); }
  catch (error) { finish('发送失败：' + error.message); }
}
