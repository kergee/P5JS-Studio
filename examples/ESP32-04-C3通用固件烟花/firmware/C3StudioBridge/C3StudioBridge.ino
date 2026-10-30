// MIT. USB hardware bridge for ESP32-C3 SuperMini; no project-specific effects.
#include <Arduino.h>
#include <string.h>
void reportError(const char* code);
#include "C3WifiMonitor.h"

#if !CONFIG_IDF_TARGET_ESP32C3
#error "Select ESP32C3 Dev Module"
#endif
#if !ARDUINO_USB_CDC_ON_BOOT
#error "Set USB CDC On Boot to Enabled"
#endif

constexpr uint8_t BUTTON_PIN = 9;
constexpr uint8_t LED_PIN = 8; // Active low on SuperMini V1601.
constexpr uint32_t DEBOUNCE_MS = 25;
constexpr uint32_t BUTTON_FEEDBACK_MS = 150;
bool rawButton = HIGH;
bool stableButton = HIGH;
bool buttonArmed = false;
uint32_t lastChangeMs = 0;
uint32_t pressCount = 0;
bool ledSteady = false;
bool ledPulsing = false;
uint32_t ledStartedMs = 0;
uint32_t ledDurationMs = 0;
bool wasConnected = false;
char inputLine[128];
size_t inputLength = 0;
bool invalidLine = false;

void applyLed() {
  digitalWrite(LED_PIN, (ledSteady || ledPulsing) ? LOW : HIGH);
}

void pulseLed(uint32_t duration) {
  ledStartedMs = millis();
  ledDurationMs = duration;
  ledPulsing = true;
  applyLed();
}

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
  if (stableButton == LOW) {
    if (!buttonArmed) return;
    buttonArmed = false;
    ++pressCount;
    pulseLed(BUTTON_FEEDBACK_MS);
  }
  if (Serial) {
    Serial.printf("{\"event\":\"button\",\"button\":\"BOOT\",\"pressed\":%s,\"count\":%lu}\n",
      stableButton == LOW ? "true" : "false", static_cast<unsigned long>(pressCount));
  }
}

void pollLed() {
  if (ledPulsing && uint32_t(millis() - ledStartedMs) >= ledDurationMs) {
    ledPulsing = false;
    applyLed(); // Restore the explicit on/off setting after a pulse.
  }
}

void reportError(const char* code) {
  Serial.printf("{\"type\":\"error\",\"code\":\"%s\"}\n", code);
}

void handleLine() {
  inputLine[inputLength] = '\0';
  if (invalidLine) {
    reportError("INVALID_OR_LONG_LINE");
  } else if (inputLength == 0) {
    // Ignore empty lines.
  } else if (strcmp(inputLine, "PING") == 0) {
    Serial.println("PONG");
  } else if (strcmp(inputLine, "INFO") == 0) {
    Serial.println("{\"type\":\"info\",\"protocol\":\"studio-c3-usb/1\",\"firmware\":\"1.1.0\",\"board\":\"ESP32-C3-SuperMini\",\"capabilities\":[\"button:BOOT\",\"led:USER\",\"pulse:USER\",\"wifi:scan\",\"wifi:rssi\"]}");
  } else if (strcmp(inputLine, "STATUS") == 0) {
    Serial.printf("{\"type\":\"status\",\"pressed\":%s,\"count\":%lu,\"led\":%d,\"pulsing\":%s,\"wifi_monitoring\":%s}\n",
      stableButton == LOW ? "true" : "false", static_cast<unsigned long>(pressCount),
      ledSteady ? 1 : 0, ledPulsing ? "true" : "false", wifiMonitoring ? "true" : "false");
  } else if (strcmp(inputLine, "LED:0") == 0 || strcmp(inputLine, "LED:1") == 0) {
    ledSteady = inputLine[4] == '1';
    ledPulsing = false;
    applyLed();
    Serial.printf("{\"type\":\"ack\",\"ack\":\"LED\",\"value\":%d}\n", ledSteady ? 1 : 0);
  } else if (strncmp(inputLine, "PULSE:", 6) == 0) {
    uint32_t duration = 0;
    bool valid = inputLength > 6;
    for (size_t i = 6; valid && i < inputLength; ++i) {
      if (inputLine[i] < '0' || inputLine[i] > '9') { valid = false; break; }
      duration = duration * 10 + uint32_t(inputLine[i] - '0');
      if (duration > 2000) valid = false;
    }
    if (!valid || duration == 0) {
      reportError("PULSE_RANGE_1_TO_2000_MS");
    } else {
      pulseLed(duration);
      Serial.printf("{\"type\":\"ack\",\"ack\":\"PULSE\",\"ms\":%lu}\n", static_cast<unsigned long>(duration));
    }
  } else if (handleWifiCommand(inputLine)) {
    // Explicit user command; Wi-Fi is off until scan/con is requested.
  } else {
    reportError("UNKNOWN_COMMAND");
  }
  inputLength = 0;
  invalidLine = false;
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
  const bool connected = bool(Serial);
  if (wasConnected && !connected) {
    // Do not keep a previous project's LED command after the host disconnects.
    ledSteady = ledPulsing = false;
    inputLength = 0;
    invalidLine = false;
    applyLed();
    stopWifiMonitor();
  }
  wasConnected = connected;
  pollButton();
  pollLed();
  if (!connected) {
    // Discard bytes left by a closed host; never replay old commands on reconnect.
    for (uint8_t i = 0; i < 32 && Serial.available() > 0; ++i) Serial.read();
    delay(1);
    return;
  }
  for (uint8_t processed = 0; processed < 32 && Serial.available() > 0; ++processed) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\r') continue;
    if (c == '\n') handleLine();
    else if (!invalidLine) {
      if (c == '\0' || inputLength >= sizeof(inputLine) - 1) invalidLine = true;
      else inputLine[inputLength++] = c;
    }
  }
  pollWifi();
  delay(1);
}
