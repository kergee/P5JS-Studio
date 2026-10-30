// Reference: ESP32-DevKitC / ESP32-WROOM-32 (classic ESP32).
// GPIO18 -> 330 ohm resistor -> LED anode (+), cathode (-) -> GND.
// Compile/upload with an external Arduino ESP32 toolchain. MIT.
constexpr int LED_PIN = 18;
char line[64];
size_t length = 0;
bool dropping = false;
void setup() { pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, LOW); Serial.begin(115200); }
void loop() {
  while (Serial.available()) {
    const char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (!dropping) {
        line[length] = 0;
        if (strcmp(line, "LED:1") == 0 || strcmp(line, "LED:0") == 0) {
          const bool on = line[4] == '1'; digitalWrite(LED_PIN, on ? HIGH : LOW);
          Serial.println(on ? "{\"ack\":\"LED\",\"value\":1}" : "{\"ack\":\"LED\",\"value\":0}");
        } else { Serial.println("{\"error\":\"unknown_command\"}"); }
      }
      length = 0; dropping = false;
    } else if (!dropping) {
      if (length < sizeof(line) - 1) line[length++] = c;
      else { dropping = true; Serial.println("{\"error\":\"line_too_long\"}"); }
    }
  }
}
