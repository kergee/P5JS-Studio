# ESP32 browser smoke checks

These are **software-only browser checks with mocked Tauri commands**, not USB or firmware tests. They load the actual teaching sketches from `examples/`; no physical serial port is opened. Tabbit owns only scratch pages created for this task.

From the repository root in PowerShell 7:

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 1421
# In a second terminal:
pwsh -File tests/browser/run-serial-smoke.ps1
```

The script exercises manual connection, scoped messages, three re-runs, pause vs sketch delivery, the 200-line cap, send errors, unplugging and explicit reconnection, successful rename cleanup, 12 language/theme/window combinations, the LED ACK sketch, existing 1.x/2.x local image and audio projects, cancel/leave/window-close cleanup, and hiding USB under a simulated mobile user-agent. Receipts are saved under `artifacts/validation/serial-<id>/` before scratch pages and the browser task are closed. The preview server is managed by its original terminal. The mobile check is not a real-phone test.

`npm test` separately runs the production bridge bootstrap in isolated JavaScript VMs and the existing gallery filter tests. `cargo test --manifest-path src-tauri/Cargo.toml` tests the native parser/controller with simulated transports and ZIP round trips in temporary directories. Real ESP32 model, driver, wiring, firmware compilation and physical I/O must still be recorded in `docs/esp32-usb.zh-CN.md` before release.
