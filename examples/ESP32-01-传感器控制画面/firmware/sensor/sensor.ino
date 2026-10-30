// Reference: ESP32-DevKitC / ESP32-WROOM-32 (classic ESP32).
// 10k potentiometer: ends to 3V3 and GND, wiper to GPIO34.
// Compile/upload with an external Arduino ESP32 toolchain. MIT.
constexpr int SENSOR_PIN = 34;
unsigned long previous = 0;
void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(SENSOR_PIN, INPUT);
}
void loop() {
  const unsigned long now = millis();
  if (now - previous >= 50) {
    previous = now;
    Serial.println(analogRead(SENSOR_PIN));
  }
}
