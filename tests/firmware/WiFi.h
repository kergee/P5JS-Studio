#pragma once
#include "Arduino.h"
#include <array>
#define WIFI_SCAN_RUNNING -1
#define WIFI_SCAN_FAILED -2
#define WIFI_STA 1
#define WIFI_OFF 0
struct MockAp {
  std::string ssid;
  std::array<uint8_t, 6> mac;
  int32_t channel;
  int32_t rssi;
};
struct MockWiFi {
  int radioMode = WIFI_OFF;
  int scanState = WIFI_SCAN_FAILED;
  int scanCalls = 0;
  bool persist = true, reconnect = true;
  bool asyncScan = false, passiveScan = false;
  uint8_t scanChannel = 0;
  std::array<uint8_t,6> scanBssid = {};
  bool hasFilter = false;
  std::vector<MockAp> results;
  void persistent(bool value) { persist = value; }
  void setAutoReconnect(bool value) { reconnect = value; }
  bool mode(int value) { radioMode = value; return true; }
  bool disconnect(bool, bool) { return true; }
  void scanDelete() { results.clear(); scanState = WIFI_SCAN_FAILED; }
  int scanNetworks(bool async, bool, bool passive, uint32_t, uint8_t channel, const char*, const uint8_t* bssid) {
    ++scanCalls; asyncScan=async; passiveScan=passive; scanChannel=channel;
    hasFilter=bssid!=nullptr;
    if(bssid) for(size_t i=0;i<6;++i)scanBssid[i]=bssid[i];
    scanState=WIFI_SCAN_RUNNING; return scanState;
  }
  int scanComplete() { return scanState; }
  void complete(std::vector<MockAp> aps) { results=aps; scanState=int(results.size()); }
  const uint8_t* BSSID(uint8_t i) { return i<results.size() ? results[i].mac.data() : nullptr; }
  std::string SSID(uint8_t i) { return results[i].ssid; }
  int32_t channel(uint8_t i) { return results[i].channel; }
  int32_t RSSI(uint8_t i) { return results[i].rssi; }
};
inline MockWiFi WiFi;
