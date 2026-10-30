#include <Arduino.h>
#include <string.h>

#if !CONFIG_IDF_TARGET_ESP32C3
#error "Select ESP32C3 Dev Module"
#endif
#if !ARDUINO_USB_CDC_ON_BOOT
#error "Set Tools > USB CDC On Boot > Enabled"
#endif

// SuperMini BOOT is GPIO9, active low. RST is not a user input.
constexpr uint8_t BUTTON_PIN = 9;
// SuperMini user LED is GPIO8, active low. Keep it off (HIGH) at startup.
constexpr uint8_t LED_PIN = 8;
constexpr uint32_t DEBOUNCE_MS = 25;
constexpr uint32_t LED_PULSE_MS = 150;
bool ledPulsing = false;
uint32_t ledStartedMs = 0;
bool rawButton = HIGH;
bool stableButton = HIGH;
bool buttonArmed = false;
uint32_t lastChangeMs = 0;
uint32_t pressCount = 0;
char inputLine[128];
size_t inputLength = 0;
bool lineTooLong = false;

void pollButton() {
  const uint32_t now = millis();
  const bool current = digitalRead(BUTTON_PIN);
  if (current != rawButton) {
    rawButton = current;
    lastChangeMs = now;
  }
  if (uint32_t(now - lastChangeMs) < DEBOUNCE_MS) return;
  if (rawButton == HIGH) buttonArmed = true;
  if (rawButton == stableButton) return;
  stableButton = rawButton;
  if (stableButton == LOW && buttonArmed) {
    buttonArmed = false;
    ++pressCount;
    digitalWrite(LED_PIN, LOW);
    ledPulsing = true;
    ledStartedMs = now;
    if (Serial) {
      Serial.printf("{\"event\":\"firework\",\"count\":%lu}\n",
                    static_cast<unsigned long>(pressCount));
    }
  }
}

void pollLed() {
  if (ledPulsing && uint32_t(millis() - ledStartedMs) >= LED_PULSE_MS) {
    digitalWrite(LED_PIN, HIGH);
    ledPulsing = false;
  }
}

void handleLine() {
  inputLine[inputLength] = '\0';
  if (lineTooLong) {
    Serial.println("ERROR: line too long");
  } else if (strcmp(inputLine, "PING") == 0) {
    Serial.println("PONG");
  } else if (strcmp(inputLine, "STATUS") == 0) {
    Serial.printf("{\"event\":\"status\",\"button\":%d,\"count\":%lu}\n",
                  digitalRead(BUTTON_PIN), static_cast<unsigned long>(pressCount));
  } else if (inputLength > 0) {
    Serial.print("ECHO: ");
    Serial.println(inputLine);
  }
  inputLength = 0;
  lineTooLong = false;
}

void setup() {
  digitalWrite(LED_PIN, HIGH);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  rawButton = stableButton = digitalRead(BUTTON_PIN);
  lastChangeMs = millis();
  Serial.begin(115200);
}

void loop() {
  pollButton();
  pollLed();
  // Bound serial work so a busy sender cannot starve the button scan.
  for (uint8_t processed = 0; processed < 32 && Serial.available() > 0; ++processed) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') {
      handleLine();
    } else if (!lineTooLong) {
      if (inputLength < sizeof(inputLine) - 1) inputLine[inputLength++] = c;
      else lineTooLong = true;
    }
  }
  delay(1);
}
