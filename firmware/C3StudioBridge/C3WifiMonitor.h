#pragma once
// MIT. Passive RSSI scanning only: never joins an AP or stores credentials.
#include <WiFi.h>
#include <esp_wifi.h>

constexpr size_t WIFI_CACHE_MAX = 64;
constexpr uint32_t WIFI_SAMPLE_MS = 500;
constexpr uint32_t WIFI_TIMEOUT_MS = 15000;
struct WifiAp {
  char ssid[33] = {};
  uint8_t mac[6] = {};
  uint8_t channel = 0;
  int32_t rssi = 0;
};
enum class WifiJob { Idle, Listing, Sampling };
WifiAp wifiCache[WIFI_CACHE_MAX];
size_t wifiCacheCount = 0;
int wifiScanTotal = 0;
bool wifiCacheTruncated = false;
bool wifiReady = false;
bool wifiMonitoring = false;
bool wifiPublishing = false;
size_t wifiPublishIndex = 0;
WifiJob wifiJob = WifiJob::Idle;
WifiAp wifiTarget;
uint32_t wifiStartedMs = 0;
uint32_t wifiLastSampleMs = 0;

void wifiMacText(const uint8_t* mac, char* output) {
  snprintf(output, 18, "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

int wifiHex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

bool wifiParseMac(const char* input, uint8_t* output) {
  if (strlen(input) != 17) return false;
  for (size_t i = 0; i < 6; ++i) {
    const int hi = wifiHex(input[i * 3]);
    const int lo = wifiHex(input[i * 3 + 1]);
    if (hi < 0 || lo < 0 || (i < 5 && input[i * 3 + 2] != ':')) return false;
    output[i] = uint8_t(hi * 16 + lo);
  }
  return true;
}

// Up to 32 SSID bytes -> at most 192 JSON bytes + terminator.
// Preserve valid UTF-8; escape malformed bytes so one AP cannot corrupt the line.
void wifiJsonSsid(const char* input, char* output) {
  const auto* p = reinterpret_cast<const uint8_t*>(input);
  size_t n = 0;
  for (size_t i = 0; p[i];) {
    const uint8_t c = p[i];
    if (c == '"' || c == '\\') { output[n++] = '\\'; output[n++] = char(c); ++i; }
    else if (c >= 32 && c < 127) { output[n++] = char(c); ++i; }
    else {
      size_t len = c >= 0xC2 && c <= 0xDF ? 2 : c >= 0xE0 && c <= 0xEF ? 3 : c >= 0xF0 && c <= 0xF4 ? 4 : 0;
      bool valid = len != 0;
      for (size_t j = 1; valid && j < len; ++j) if (p[i+j] < 0x80 || p[i+j] > 0xBF) valid = false;
      if (valid && ((c == 0xE0 && p[i+1] < 0xA0) || (c == 0xED && p[i+1] > 0x9F)
          || (c == 0xF0 && p[i+1] < 0x90) || (c == 0xF4 && p[i+1] > 0x8F))) valid = false;
      if (valid) { for (size_t j = 0; j < len; ++j) output[n++] = char(p[i++]); }
      else { snprintf(output + n, 7, "\\u%04x", unsigned(c)); n += 6; ++i; }
    }
  }
  output[n] = '\0';
}

void stopWifiMonitor() {
  wifiMonitoring = wifiPublishing = false;
  if (wifiReady) {
    if (wifiJob != WifiJob::Idle) esp_wifi_scan_stop();
    WiFi.scanDelete();
    WiFi.mode(WIFI_OFF);
  }
  wifiJob = WifiJob::Idle;
  wifiReady = false;
}

bool ensureWifiReady() {
  if (wifiReady) return true;
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  if (!WiFi.mode(WIFI_STA)) { reportError("WIFI_INIT_FAILED"); return false; }
  WiFi.disconnect(false, false); // No erase of old configuration; no WiFi.begin().
  wifiReady = true;
  return true;
}

bool startWifiJob(WifiJob job) {
  if (!ensureWifiReady()) return false;
  WiFi.scanDelete();
  wifiStartedMs = millis();
  wifiLastSampleMs = wifiStartedMs;
  // Passive scans receive beacon frames. Target samples stay on the chosen AP's
  // channel and filter BSSID; they do not associate with the network.
  const int result = WiFi.scanNetworks(true, true, true, job == WifiJob::Listing ? 180 : 200,
      job == WifiJob::Listing ? 0 : wifiTarget.channel, nullptr,
      job == WifiJob::Listing ? nullptr : wifiTarget.mac);
  if (result == WIFI_SCAN_FAILED) { reportError("WIFI_SCAN_FAILED"); return false; }
  wifiJob = job;
  return true;
}

void emitWifiAp(const WifiAp& ap) {
  char ssid[193], mac[18];
  wifiJsonSsid(ap.ssid, ssid);
  wifiMacText(ap.mac, mac);
  Serial.printf("{\"event\":\"wifi_ap\",\"ssid\":\"%s\",\"bssid\":\"%s\",\"channel\":%u,\"rssi\":%ld}\n",
      ssid, mac, unsigned(ap.channel), static_cast<long>(ap.rssi));
}

void emitWifiSample(bool available, int32_t rssi = 0) {
  char ssid[193], mac[18], value[16];
  wifiJsonSsid(wifiTarget.ssid, ssid);
  wifiMacText(wifiTarget.mac, mac);
  if (available) snprintf(value, sizeof(value), "%ld", static_cast<long>(rssi));
  else strcpy(value, "null");
  Serial.printf("{\"event\":\"wifi_rssi\",\"ssid\":\"%s\",\"bssid\":\"%s\",\"channel\":%u,\"available\":%s,\"rssi\":%s,\"ms\":%lu}\n",
      ssid, mac, unsigned(wifiTarget.channel), available ? "true" : "false", value, static_cast<unsigned long>(millis()));
}

void pollWifi() {
  if (wifiPublishing) {
    // Only one output record per loop, allowing button/LED/commands to run.
    if (wifiPublishIndex < wifiCacheCount) emitWifiAp(wifiCache[wifiPublishIndex++]);
    else {
      Serial.printf("{\"event\":\"wifi_scan_done\",\"total\":%d,\"shown\":%u,\"truncated\":%s}\n",
          wifiScanTotal, unsigned(wifiCacheCount), wifiCacheTruncated ? "true" : "false");
      wifiPublishing = false;
    }
    return;
  }
  if (wifiJob != WifiJob::Idle) {
    const int count = WiFi.scanComplete();
    if (count == WIFI_SCAN_RUNNING && uint32_t(millis() - wifiStartedMs) < WIFI_TIMEOUT_MS) return;
    const WifiJob completed = wifiJob;
    wifiJob = WifiJob::Idle;
    if (count < 0) {
      esp_wifi_scan_stop();
      WiFi.scanDelete();
      reportError("WIFI_SCAN_FAILED_OR_TIMEOUT");
      if (completed == WifiJob::Sampling && wifiMonitoring) emitWifiSample(false);
      return;
    }
    if (completed == WifiJob::Listing) {
      wifiScanTotal = count;
      wifiCacheCount = 0;
      wifiCacheTruncated = size_t(count) > WIFI_CACHE_MAX;
      for (int i = 0; i < count && wifiCacheCount < WIFI_CACHE_MAX; ++i) {
        const auto index = static_cast<uint8_t>(i);
        const uint8_t* mac = WiFi.BSSID(index);
        if (!mac) continue;
        auto& ap = wifiCache[wifiCacheCount++];
        strncpy(ap.ssid, WiFi.SSID(index).c_str(), 32); ap.ssid[32] = '\0';
        memcpy(ap.mac, mac, 6);
        ap.channel = uint8_t(WiFi.channel(index));
        ap.rssi = WiFi.RSSI(index);
      }
      wifiPublishIndex = 0;
      wifiPublishing = true;
    } else if (wifiMonitoring) {
      bool found = false;
      for (int i = 0; i < count && i < 256; ++i) {
        const auto index = static_cast<uint8_t>(i);
        const uint8_t* mac = WiFi.BSSID(index);
        if (mac && memcmp(mac, wifiTarget.mac, 6) == 0) {
          emitWifiSample(true, WiFi.RSSI(index)); found = true; break;
        }
      }
      if (!found) emitWifiSample(false);
    }
    WiFi.scanDelete();
    return;
  }
  if (wifiMonitoring && uint32_t(millis() - wifiLastSampleMs) >= WIFI_SAMPLE_MS) {
    if (!startWifiJob(WifiJob::Sampling)) { emitWifiSample(false); wifiLastSampleMs = millis(); }
  }
}

bool handleWifiCommand(const char* line) {
  if (strcmp(line, "stop") == 0) {
    stopWifiMonitor();
    Serial.println("{\"type\":\"ack\",\"ack\":\"stop\"}");
    return true;
  }
  const bool scan = strcmp(line, "scan") == 0;
  const bool select = strncmp(line, "con:", 4) == 0;
  if (!scan && !select) return false;
  if (wifiJob != WifiJob::Idle || wifiPublishing) { reportError("WIFI_BUSY_TRY_AGAIN"); return true; }
  if (scan) {
    wifiMonitoring = false;
    wifiCacheCount = 0;
    if (startWifiJob(WifiJob::Listing)) Serial.println("{\"type\":\"ack\",\"ack\":\"scan\"}");
    return true;
  }
  const char* target = line + 4;
  if (!*target) { reportError("TARGET_REQUIRED"); return true; }
  if (!wifiCacheCount) { reportError("SCAN_FIRST"); return true; }
  const bool byMac = strncmp(target, "bssid=", 6) == 0;
  uint8_t wantedMac[6];
  if (byMac && !wifiParseMac(target + 6, wantedMac)) { reportError("INVALID_BSSID"); return true; }
  int chosen = -1;
  for (size_t i = 0; i < wifiCacheCount; ++i) {
    const bool match = byMac ? memcmp(wantedMac, wifiCache[i].mac, 6) == 0 : strcmp(target, wifiCache[i].ssid) == 0;
    if (match) {
      if (chosen >= 0 && !byMac) { reportError("SSID_AMBIGUOUS_USE_BSSID"); return true; }
      chosen = int(i);
    }
  }
  if (chosen < 0) { reportError("TARGET_NOT_IN_SCAN"); return true; }
  if (!byMac && wifiCacheTruncated) { reportError("SCAN_TRUNCATED_USE_BSSID"); return true; }
  wifiTarget = wifiCache[chosen];
  if (!ensureWifiReady()) return true;
  wifiMonitoring = true;
  wifiLastSampleMs = millis() - WIFI_SAMPLE_MS;
  char ssid[193], mac[18]; wifiJsonSsid(wifiTarget.ssid, ssid); wifiMacText(wifiTarget.mac, mac);
  Serial.printf("{\"type\":\"ack\",\"ack\":\"con\",\"ssid\":\"%s\",\"bssid\":\"%s\",\"channel\":%u}\n",
      ssid, mac, unsigned(wifiTarget.channel));
  return true;
}
