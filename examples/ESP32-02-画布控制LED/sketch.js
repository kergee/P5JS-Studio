// Anonymous teaching example, MIT. A click requests a command; ACK confirms it.
let acknowledged = false;
let pending = false;
let message = 'Open More tools > ESP32, then click the canvas';
let requestTimer;
function setup() {
  createCanvas(400, 320); textFont('sans-serif');
  studioSerial.onLine((line) => {
    try {
      const data = JSON.parse(line);
      if (data.ack !== 'LED' || ![0, 1].includes(data.value)) return;
      acknowledged = data.value === 1;
      pending = false; clearTimeout(requestTimer);
      message = 'Firmware ACK: LED ' + (acknowledged ? 'ON' : 'OFF');
    } catch (_) { /* Ignore startup messages and other text. */ }
  });
}
function draw() {
  background(24, 30, 48);
  noStroke(); fill(acknowledged ? '#66e0a3' : '#536079');
  circle(width / 2, height / 2, 135);
  fill(255); textSize(15); text('Click to toggle LED', 16, 26);
  textSize(12); text(message, 16, height - 40, width - 32, 36);
  if (!studioSerial.connected && pending) {
    pending = false; clearTimeout(requestTimer); message = 'Disconnected; click after reconnecting';
  }
}
async function mousePressed() {
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height || pending) return;
  if (!studioSerial.connected) { message = 'Device not connected'; return; }
  pending = true; message = 'Waiting for firmware ACK...';
  requestTimer = setTimeout(() => { pending = false; message = 'No ACK received; check firmware and wiring'; }, 3000);
  try { await studioSerial.writeLine('LED:' + (acknowledged ? 0 : 1)); }
  catch (error) { pending = false; clearTimeout(requestTimer); message = error.message; }
}
