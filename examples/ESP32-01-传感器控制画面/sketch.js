// Anonymous teaching example, MIT. No automatic connection or writes.
let sensorValue = 2048;
let received = false;
function setup() {
  createCanvas(400, 320);
  textFont('sans-serif');
  studioSerial.onLine((line) => {
    if (!/^\d{1,4}$/.test(line)) return;
    const value = Number(line);
    if (value >= 0 && value <= 4095) { sensorValue = value; received = true; }
  });
}
function draw() {
  background(24, 30, 48);
  noStroke();
  fill(map(sensorValue, 0, 4095, 60, 255), 150, 210);
  circle(width / 2, height / 2, map(sensorValue, 0, 4095, 25, 220));
  fill(255); textSize(15);
  text('Sensor: ' + sensorValue, 16, 26);
  text(studioSerial.connected ? 'USB connected' : 'Open More tools > ESP32 to connect', 16, height - 38);
  text(received ? 'Turn the potentiometer' : 'Preview only: waiting for sensor data', 16, height - 16);
}
