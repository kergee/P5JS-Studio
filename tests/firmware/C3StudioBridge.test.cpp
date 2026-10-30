#include <stdexcept>
#include <iostream>
#include "../../firmware/C3StudioBridge/C3StudioBridge.ino"

int checks = 0;
void check(bool result, const char* message) {
  if (!result) throw std::runtime_error(message);
  ++checks;
}
void advance(uint32_t ms) {
  const uint32_t start = mockClock;
  while (uint32_t(mockClock - start) < ms) loop();
}
std::string send(const std::string& bytes) {
  Serial.output.clear();
  Serial.input += bytes;
  while (!Serial.input.empty()) loop();
  return Serial.output;
}
bool has(const std::string& text, const char* part) { return text.find(part) != std::string::npos; }

int main() {
  try {
    mockInput[9] = HIGH;
    setup();
    advance(30);
    check(mockOutputPins.size() == 1 && mockOutputPins[0] == 8, "only onboard LED is output");
    check(mockOutput[8] == HIGH && Serial.baud == 115200, "startup LED off / baud");
    check(Serial.output.empty(), "startup sends no automatic command or event");
    Serial.input = "PI"; loop();
    check(Serial.output.empty(), "partial command waits for LF");
    check(send("NG\r\n") == "PONG\n", "chunked CRLF PING");
    auto info = send("INFO\nSTATUS\n");
    check(has(info, "studio-c3-usb/1") && has(info, "\"type\":\"status\""), "coalesced INFO/STATUS");
    check(has(send("LED:1\n"), "\"ack\":\"LED\",\"value\":1") && mockOutput[8] == LOW, "LED on has ACK");
    check(has(send("PULSE:10\n"), "\"ack\":\"PULSE\""), "pulse ACK");
    advance(12);
    check(mockOutput[8] == LOW && !ledPulsing, "pulse restores steady on");
    send("LED:0\n");
    check(mockOutput[8] == HIGH, "LED off cancels pulse");
    for (const auto& command : {"PULSE:0\n", "PULSE:2001\n", "PULSE:-1\n", "PULSE:1x\n", "PULSE:\n"}) {
      check(has(send(command), "PULSE_RANGE") && mockOutput[8] == HIGH && !ledPulsing, "invalid pulse does not actuate");
    }
    check(has(send("LED:9\n"), "UNKNOWN_COMMAND") && mockOutput[8] == HIGH, "unknown command does not actuate");
    auto recovery = send(std::string(128, 'X') + "\nPING\n");
    check(has(recovery,"INVALID_OR_LONG_LINE") && has(recovery,"PONG"), "long line recovers next command");
    check(has(send(std::string("LED:1\0junk\n",11)),"INVALID_OR_LONG_LINE") && mockOutput[8] == HIGH, "embedded NUL rejected");

    Serial.output.clear();
    mockInput[9] = LOW; advance(5);
    mockInput[9] = HIGH; advance(5);
    mockInput[9] = LOW; advance(20);
    check(pressCount == 0 && Serial.output.empty(), "button bounce ignored");
    advance(10);
    check(pressCount == 1 && has(Serial.output,"\"pressed\":true") && mockOutput[8] == LOW, "debounced press emits once and flashes");
    Serial.output.clear(); advance(200);
    check(pressCount == 1 && Serial.output.empty() && mockOutput[8] == HIGH, "hold does not repeat / pulse expires");
    mockInput[9] = HIGH; advance(30);
    check(has(Serial.output,"\"pressed\":false") && pressCount == 1, "release event does not count as press");
    mockInput[9] = LOW; advance(30);
    check(pressCount == 2, "next press increments once");
    mockInput[9] = HIGH; advance(30);

    send("LED:1\n");
    Serial.connected = false;
    Serial.input = "LED:1\n";
    advance(3);
    check(!ledSteady && !ledPulsing && mockOutput[8] == HIGH && Serial.input.empty(), "disconnect clears output and queued commands");
    Serial.connected = true; loop();
    check(mockOutput[8] == HIGH, "reconnect does not replay output");
    mockClock = 0xfffffff0u;
    send("PULSE:40\n"); advance(42);
    check(mockOutput[8] == HIGH && !ledPulsing, "pulse handles millis rollover");

    // Model reboot while BOOT is already held: release before arming a new press.
    rawButton = stableButton = LOW; buttonArmed = false; pressCount = 0;
    mockInput[9] = LOW; lastChangeMs = mockClock; Serial.output.clear();
    advance(40);
    check(pressCount == 0 && Serial.output.empty(), "held at startup does not fire");
    mockInput[9] = HIGH; advance(30);
    mockInput[9] = LOW; advance(30);
    check(pressCount == 1, "release then press arms normally");
    mockInput[9] = HIGH; advance(30);
    check(WiFi.radioMode == WIFI_OFF && WiFi.scanCalls == 0, "Wi-Fi remains off until requested");
    check(has(send("con:Office\n"), "SCAN_FIRST"), "target requires a scan");
    check(has(send("scan\n"), "\"ack\":\"scan\"") && WiFi.asyncScan && WiFi.passiveScan, "scan is async and passive");
    check(!WiFi.persist && !WiFi.reconnect, "scans use RAM and no auto reconnect");
    check(send("PING\n") == "PONG\n", "PING works while scan runs");
    const auto before = pressCount;
    mockInput[9] = LOW; advance(30);
    check(pressCount == before + 1 && has(Serial.output,"\"event\":\"button\""), "BOOT and LED run during scanning");
    check(has(send("con:Office\n"),"WIFI_BUSY"), "selection waits for scan completion");
    const MockAp a{"Office",{2,1,2,3,4,1},6,-45};
    const MockAp b{"Office",{2,1,2,3,4,2},11,-65};
    const MockAp c{"Cafe",{2,1,2,3,4,3},1,-51};
    WiFi.complete({a,b,c}); Serial.output.clear(); advance(10);
    check(has(Serial.output,"wifi_scan_done") && wifiCacheCount == 3, "scan rows and completion published");
    check(has(send("con:Office\n"),"SSID_AMBIGUOUS_USE_BSSID") && !wifiMonitoring, "duplicate SSID never silently selects");
    check(has(send("con:bssid=broken\n"),"INVALID_BSSID"), "invalid MAC rejected");
    check(has(send("con:Missing\n"),"TARGET_NOT_IN_SCAN"), "missing target rejected");
    check(has(send("con:bssid=02:01:02:03:04:01\n"),"\"ack\":\"con\"") && wifiMonitoring, "explicit BSSID accepted");
    check(WiFi.scanChannel==6 && WiFi.hasFilter && WiFi.scanBssid==a.mac, "samples lock channel and BSSID");
    WiFi.complete({b,a}); Serial.output.clear(); loop();
    check(has(Serial.output,"\"available\":true,\"rssi\":-45"), "RSSI ignores other APs");
    advance(500); WiFi.complete({b}); Serial.output.clear(); loop();
    check(has(Serial.output,"\"available\":false,\"rssi\":null"), "missing AP is null not zero");
    check(has(send("stop\n"),"\"ack\":\"stop\"") && WiFi.radioMode==WIFI_OFF && !wifiMonitoring, "stop cancels scan and powers radio down");
    const int oldScanCalls=WiFi.scanCalls; advance(1000);
    check(WiFi.scanCalls==oldScanCalls, "stop does not restart scanning");
    check(has(send("con:Cafe\n"),"\"ack\":\"con\"") && wifiMonitoring, "unique SSID accepted from cache");
    send("stop\n"); send("scan\n"); advance(WIFI_TIMEOUT_MS+5);
    check(has(Serial.output,"WIFI_SCAN_FAILED_OR_TIMEOUT") && wifiJob==WifiJob::Idle, "scan timeout recovers");
    send("scan\n");
    std::vector<MockAp> many;
    for(int i=0;i<65;++i) { auto ap=c; ap.ssid="AP"+std::to_string(i); ap.mac[5]=uint8_t(i); many.push_back(ap); }
    WiFi.complete(many); Serial.output.clear(); advance(70);
    check(wifiCacheCount==64 && has(Serial.output,"\"truncated\":true"), "large scan reports cache truncation");
    check(has(send("con:AP0\n"),"SCAN_TRUNCATED_USE_BSSID"), "truncated list requires explicit BSSID");
    send("con:bssid=02:01:02:03:04:00\n"); Serial.connected=false; loop();
    check(!wifiMonitoring && wifiJob==WifiJob::Idle && WiFi.radioMode==WIFI_OFF, "USB disconnect stops Wi-Fi monitoring");
    Serial.connected=true; advance(1000);
    check(!wifiMonitoring, "USB reconnect never resumes monitoring automatically");
    char escaped[193]; wifiJsonSsid("Cafe\"\\\x01",escaped);
    check(std::string(escaped)=="Cafe\\\"\\\\\\u0001", "SSID JSON escaping");
    wifiJsonSsid("\xE4\xB8\xAD\xE6\x96\x87",escaped);
    check(std::string(escaped)=="\xE4\xB8\xAD\xE6\x96\x87", "UTF-8 SSID retained");
    wifiJsonSsid("\xff",escaped);
    check(std::string(escaped)=="\\u00ff", "malformed SSID bytes cannot corrupt JSON");
    std::cout << checks << " host checks passed (actual firmware + mocked pins/USB/time; no hardware proof)\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "FAIL: " << error.what() << '\n';
    return 1;
  }
}
