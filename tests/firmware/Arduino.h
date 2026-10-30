#pragma once
// Host-only Arduino shim. Never include this directory in the device build.
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT_PULLUP 2
inline uint32_t mockClock = 0;
inline int mockInput[256] = {};
inline int mockOutput[256] = {};
inline std::vector<int> mockOutputPins;
inline uint32_t millis() { return mockClock; }
inline void delay(uint32_t ms) { mockClock += ms; }
inline int digitalRead(uint8_t pin) { return mockInput[pin]; }
inline void digitalWrite(uint8_t pin, int value) { mockOutput[pin] = value; }
inline void pinMode(uint8_t pin, int mode) { if (mode == OUTPUT) mockOutputPins.push_back(pin); }
struct MockSerial {
  bool connected = true;
  std::string input, output;
  unsigned baud = 0;
  explicit operator bool() const { return connected; }
  void begin(unsigned value) { baud = value; }
  int available() const { return static_cast<int>(input.size()); }
  int read() { if (input.empty()) return -1; const auto c = static_cast<unsigned char>(input.front()); input.erase(0,1); return c; }
  void println(const char* line) { output += line; output += '\n'; }
  template<class... Args> void printf(const char* format, Args... args) {
    char buffer[1024];
    std::snprintf(buffer, sizeof(buffer), format, args...);
    output += buffer;
  }
};
inline MockSerial Serial;
