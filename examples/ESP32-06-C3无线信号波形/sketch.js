// MIT. Measured RSSI only; no simulated wireless data and no motion inference.
let radioTarget = null;
let radioSamples = [];
let currentRssi = null;
let radioActive = false;
let radioHint = '在 ESP32 发送框输入 scan，再输入 con:Wi-Fi名称';
let scanEntries = 0;
let lastSampleAt = -Infinity;
let bootCount = 0;
let fireworkPoints = [];

function setup() {
  createCanvas(Math.max(260, Math.min(windowWidth, 640)), 380);
  pixelDensity(1);
  textFont('sans-serif');
  if (typeof studioSerial === 'undefined') {
    radioHint = '先打开“更多工具 → ESP32”，再运行';
    return;
  }
  studioSerial.onLine((line) => {
    if (line === 'PONG') { radioHint = 'PONG：USB 串口正常'; return; }
    let data;
    try { data = JSON.parse(line); } catch (_) { return; }
    if (!data) return;
    if (data.type === 'ack' && data.ack === 'scan') {
      scanEntries = 0;
      radioActive = false;
      radioHint = '正在扫描，请等 wifi_scan_done 后选择目标';
    }
    if (data.event === 'wifi_ap') scanEntries++;
    if (data.event === 'wifi_scan_done') {
      radioHint = '扫描完成：显示 ' + data.shown + ' 个，详情见接收区';
    }
    if (data.type === 'ack' && data.ack === 'con') {
      radioTarget = {ssid:data.ssid, bssid:data.bssid};
      radioSamples = [];
      currentRssi = null;
      radioActive = true;
      radioHint = '目标已锁定，等待 RSSI 样本';
    }
    if (data.event === 'wifi_rssi' && typeof data.bssid === 'string') {
      if (radioTarget && radioTarget.bssid !== data.bssid) return;
      radioTarget = {ssid:data.ssid, bssid:data.bssid};
      radioActive = true;
      lastSampleAt = millis();
      currentRssi = data.available === true && Number.isFinite(data.rssi) ? data.rssi : null;
      radioSamples.push({t:millis(), value:currentRssi});
      if (radioSamples.length > 180) radioSamples.shift();
      radioHint = currentRssi === null ? '本次未收到目标信号 · 曲线留空' : '正在接收 RSSI · stop 可停止检测';
    }
    if (data.type === 'ack' && data.ack === 'stop') {
      radioActive = false;
      currentRssi = null;
      radioHint = '已停止检测 · 按键和 PING 仍可使用';
    }
    if (data.type === 'error') radioHint = '固件提示：' + data.code;
    if (data.event === 'button' && data.button === 'BOOT' && data.pressed === true) {
      bootCount++;
      const x = random(width * 0.3, width * 0.8), y = random(140, 220);
      for (let i = 0; i < 50; i++) {
        const a = random(TWO_PI), speed = random(0.7, 3.2);
        fireworkPoints.push({x,y,vx:cos(a)*speed,vy:sin(a)*speed,life:255});
      }
      if (fireworkPoints.length > 600) fireworkPoints.splice(0,fireworkPoints.length - 600);
    }
  });
}

function draw() {
  background('#0b1425');
  const connected = typeof studioSerial !== 'undefined' && studioSerial.connected;
  if (!connected) { radioActive = false; currentRssi = null; }
  const fresh = connected && radioActive && millis() - lastSampleAt < 5000;
  noStroke(); fill('#b7f5df'); textSize(width < 360 ? 17 : 21);
  text('C3 · 无线信号波形', 16, 29);
  fill('#aabbd4'); textSize(11);
  text((connected ? 'USB 已连接' : 'USB 未连接') + ' · BOOT 烟花 ' + bootCount + ' 次',16,49);
  text(radioTarget ? (radioTarget.ssid || '(隐藏名称)') : '尚未选择信号源',16,69,width-32,18);
  text(radioTarget ? radioTarget.bssid : '仅测量 2.4GHz Wi-Fi 的 RSSI',16,98);
  textAlign(RIGHT);
  fill(fresh && currentRssi !== null ? '#71e3f7' : '#aabbd4');
  textSize(20);
  text(fresh && currentRssi !== null ? currentRssi + ' dBm' : '— dBm',width-16,98);
  textAlign(LEFT); textSize(11);
  const left=44, right=width-18, top=126, bottom=285;
  for(let value=-100; value<=-20; value+=20) {
    const y=map(value,-100,-20,bottom,top);
    stroke('#26364c'); strokeWeight(1); line(left,y,right,y);
    noStroke(); fill('#92a5c0'); text(value,9,y+4);
  }
  stroke('#71e3f7'); strokeWeight(2);
  let previous=null;
  for(const sample of radioSamples) {
    const age=millis()-sample.t;
    if(age>30000 || sample.value===null) { previous=null; continue; }
    const point={x:map(age,30000,0,left,right),y:map(constrain(sample.value,-100,-20),-100,-20,bottom,top)};
    if(previous) line(previous.x,previous.y,point.x,point.y);
    point.value=sample.value;
    previous=point;
  }
  noStroke(); fill('#92a5c0'); text('30秒前',left,305);
  textAlign(RIGHT); text('现在',right,305); textAlign(LEFT);
  fill('#bfcee2'); textSize(11);
  const hint = connected && radioActive && !fresh ? '等待新样本 · 检查接收区或发送 stop' : radioHint;
  text(hint,16,327,width-32,32);
  fill('#7f94af'); text('RSSI 波动不等于检测到人经过',16,367);
  const step=Math.min(deltaTime/(1000/60),3);
  for(let i=fireworkPoints.length-1;i>=0;i--) {
    const p=fireworkPoints[i];
    p.x+=p.vx*step; p.y+=p.vy*step; p.vy+=0.025*step; p.life-=3*step;
    fill(255,190,110,Math.max(0,p.life)); circle(p.x,p.y,2.5);
    if(p.life<=0)fireworkPoints.splice(i,1);
  }
}
