// MIT. C3StudioBridge button events launch fireworks; no project-specific firmware.
let rockets = [];
let sparks = [];
let stars = [];
let receivedPresses = 0;
let boardPressCount = 0;
let serialHint = '请连接设备，然后轻按板上的 BOOT';
let palette = ['#ffb86b', '#ff648c', '#7ae7f5', '#c4a0ff', '#9bffc3'];

function serialAvailable() {
  return typeof studioSerial !== 'undefined';
}

function canvasSize() {
  return [Math.max(240, Math.min(windowWidth, 640)),
    Math.max(240, Math.min(windowHeight, 420))];
}

function makeStars() {
  stars = Array.from({ length: 55 }, () => ({
    x: random(width), y: random(85, height - 40), light: random(35, 120)
  }));
}

function setup() {
  createCanvas(...canvasSize());
  pixelDensity(1);
  textFont('sans-serif');
  background(8, 13, 30);
  makeStars();
  if (!serialAvailable()) {
    serialHint = '先打开“更多工具 → ESP32”，再运行';
    return;
  }
  studioSerial.onLine((line) => {
    if (line === 'PONG') {
      serialHint = 'PONG：通信正常，请轻按 BOOT 发射烟花';
      return;
    }
    let data;
    try { data = JSON.parse(line); } catch (_) { return; }
    if (!data || data.event !== 'button' || data.button !== 'BOOT' || data.pressed !== true ||
        !Number.isSafeInteger(data.count) || data.count < 1) return;
    receivedPresses++;
    boardPressCount = data.count;
    serialHint = '收到 BOOT 按键消息 · 正在发射';
    if (rockets.length < 12) {
      rockets.push({ x: random(width * 0.18, width * 0.82), y: height - 33,
        targetY: random(95, Math.max(100, height * 0.5)),
        speed: random(4, 6), shade: random(palette) });
    }
  });
}

function burst(rocket) {
  const available = Math.min(85, 1200 - sparks.length);
  for (let i = 0; i < available; i++) {
    const angle = TWO_PI * i / available + random(-0.04, 0.04);
    const speed = random(1.2, 3.7);
    sparks.push({ x: rocket.x, y: rocket.y, px: rocket.x, py: rocket.y,
      vx: cos(angle) * speed, vy: sin(angle) * speed,
      life: 255, shade: rocket.shade, size: random(1.2, 2.4) });
  }
}

function draw() {
  const step = Math.min(deltaTime / (1000 / 60), 3);
  background(8, 13, 30, 65);
  noStroke();
  for (const star of stars) {
    fill(190, 210, 245, star.light);
    circle(star.x, star.y, 1.3);
  }
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rocket = rockets[i];
    rocket.y -= rocket.speed * step;
    stroke(rocket.shade);
    strokeWeight(2);
    line(rocket.x, rocket.y + 12, rocket.x, rocket.y);
    noStroke();
    fill(255);
    circle(rocket.x, rocket.y, 3);
    if (rocket.y <= rocket.targetY) {
      burst(rocket);
      rockets.splice(i, 1);
    }
  }
  blendMode(ADD);
  for (let i = sparks.length - 1; i >= 0; i--) {
    const spark = sparks[i];
    spark.px = spark.x;
    spark.py = spark.y;
    spark.x += spark.vx * step;
    spark.y += spark.vy * step;
    spark.vx *= Math.pow(0.985, step);
    spark.vy += 0.035 * step;
    spark.life -= 3.0 * step;
    const shade = color(spark.shade);
    shade.setAlpha(Math.max(0, spark.life));
    stroke(shade);
    strokeWeight(spark.size);
    line(spark.px, spark.py, spark.x, spark.y);
    noStroke();
    fill(shade);
    circle(spark.x, spark.y, spark.size);
    if (spark.life <= 0) sparks.splice(i, 1);
  }
  blendMode(BLEND);
  noStroke();
  fill(8, 13, 30);
  rect(0, 0, width, 78);
  rect(0, height - 43, width, 43);
  const connected = serialAvailable() && studioSerial.connected;
  fill(connected ? '#9bffc3' : '#ffb86b');
  circle(17, 23, 6);
  fill('#edf3ff');
  textSize(width < 340 ? 17 : 22);
  text('BOOT · 按键烟花', 30, 31);
  textSize(11);
  fill('#a5b6d0');
  text(connected ? '已连接 · 轻按 BOOT 发射' : 'ESP32 面板 → 连接 · 115200', 14, 56);
  text('收到 ' + receivedPresses + ' 次 · 板端计数 ' + boardPressCount, 14, 72);
  fill('#c0cee2');
  text(serialHint, 14, height - 29, width - 28, 34);
}

// Clicking only checks communication; it never simulates a hardware button.
async function mousePressed() {
  if (mouseX < 0 || mouseX >= width || mouseY < 0 || mouseY >= height) return;
  if (!serialAvailable() || !studioSerial.connected) {
    serialHint = '请先打开 ESP32 面板并连接设备';
    return;
  }
  serialHint = '正在发送 PING，等待开发板回复…';
  try { await studioSerial.writeLine('PING'); }
  catch (error) { serialHint = '发送失败：' + error.message; }
}

function windowResized() {
  resizeCanvas(...canvasSize());
  makeStars();
}
