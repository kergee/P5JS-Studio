//! Optional, single-device USB serial transport. No project metadata is modified.
use serde::Serialize;
use std::collections::HashSet;
use std::io::{self, Read, Write};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const MAX_LINE: usize = 8192;
const EVENT: &str = "p5studio-serial";

trait Transport: Read + Write + Send {}
impl<T: Read + Write + Send> Transport for T {}
type Emit = Arc<dyn Fn(SerialEvent) + Send + Sync>;

#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SerialEvent {
    owner: String,
    session: String,
    connected: bool,
    lines: Vec<String>,
    error: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    id: String,
    port: String,
    baud_rate: u32,
}

#[derive(Serialize)]
pub struct Port {
    name: String,
    label: String,
}

#[derive(Default)]
struct Decoder {
    bytes: Vec<u8>,
    dropping: bool,
}
impl Decoder {
    fn feed(&mut self, bytes: &[u8]) -> Vec<Result<String, String>> {
        let mut result = Vec::new();
        for &byte in bytes {
            if byte == b'\n' {
                if !self.dropping {
                    if self.bytes.last() == Some(&b'\r') {
                        self.bytes.pop();
                    }
                    result.push(
                        String::from_utf8(std::mem::take(&mut self.bytes))
                            .map_err(|_| "invalid_utf8".into()),
                    );
                }
                self.bytes.clear();
                self.dropping = false;
            } else if !self.dropping {
                self.bytes.push(byte);
                if self.bytes.len() > MAX_LINE
                    && !(self.bytes.len() == MAX_LINE + 1 && byte == b'\r')
                {
                    self.bytes.clear();
                    self.dropping = true;
                    result.push(Err("line_too_long".into()));
                }
            }
        }
        result
    }
}

fn encode_line(text: &str) -> Result<Vec<u8>, String> {
    if text.len() > MAX_LINE {
        return Err("line_too_long".into());
    }
    if text.contains(['\r', '\n']) {
        return Err("single_line_only".into());
    }
    Ok(format!("{text}\n").into_bytes())
}

struct Request {
    bytes: Vec<u8>,
    reply: mpsc::SyncSender<Result<(), String>>,
    cancelled: Arc<AtomicBool>,
}
struct Connection {
    owner: String,
    session: Session,
    stop: Arc<AtomicBool>,
    tx: mpsc::SyncSender<Request>,
    worker: Option<JoinHandle<()>>,
}
impl Connection {
    fn close(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
impl Drop for Connection {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
#[derive(Default)]
struct Inner {
    connection: Option<Connection>,
    revoked: HashSet<String>,
}
#[derive(Default)]
pub struct SerialManager {
    inner: Mutex<Inner>,
    next: AtomicU64,
}

impl SerialManager {
    pub fn close_all(&self) {
        if let Ok(mut state) = self.inner.lock() {
            if let Some(connection) = state.connection.take() {
                connection.close();
            }
        }
    }
    fn connect_with(
        &self,
        owner: String,
        port: String,
        baud_rate: u32,
        open: impl FnOnce() -> Result<Box<dyn Transport>, String>,
        emit: Emit,
    ) -> Result<Session, String> {
        if owner.is_empty() || owner.len() > 128 {
            return Err("invalid_owner".into());
        }
        if baud_rate == 0 || baud_rate > 5_000_000 {
            return Err("invalid_baud".into());
        }
        let mut state = self.inner.lock().map_err(|_| "serial_state_unavailable")?;
        if state.revoked.contains(&owner) {
            return Err("project_closed".into());
        }
        if let Some(connection) = state.connection.take() {
            if !connection.stop.load(Ordering::SeqCst) {
                state.connection = Some(connection);
                return Err("port_busy".into());
            }
            connection.close();
        }
        let transport = open()?;
        let session = Session {
            id: self.next.fetch_add(1, Ordering::SeqCst).to_string(),
            port,
            baud_rate,
        };
        let (tx, rx) = mpsc::sync_channel::<Request>(32);
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = stop.clone();
        let event = SerialEvent {
            owner: owner.clone(),
            session: session.id.clone(),
            connected: true,
            lines: vec![],
            error: None,
        };
        let worker = thread::spawn(move || run_transport(transport, rx, worker_stop, event, emit));
        state.connection = Some(Connection {
            owner,
            session: session.clone(),
            stop,
            tx,
            worker: Some(worker),
        });
        Ok(session)
    }

    fn disconnect(&self, owner: &str, release: bool) -> Result<(), String> {
        let mut state = self.inner.lock().map_err(|_| "serial_state_unavailable")?;
        // Remember released editors so a late queued connect cannot outlive its project.
        if release {
            state.revoked.insert(owner.into());
        }
        if state
            .connection
            .as_ref()
            .is_some_and(|connection| connection.owner == owner)
        {
            state.connection.take().unwrap().close();
        }
        Ok(())
    }

    fn write_line(&self, owner: &str, session: &str, text: &str) -> Result<(), String> {
        let bytes = encode_line(text)?;
        let (reply, result) = mpsc::sync_channel(1);
        let cancelled = Arc::new(AtomicBool::new(false));
        {
            let state = self.inner.lock().map_err(|_| "serial_state_unavailable")?;
            let connection = state.connection.as_ref().ok_or("not_connected")?;
            if connection.owner != owner
                || connection.session.id != session
                || connection.stop.load(Ordering::SeqCst)
            {
                return Err("not_connected".into());
            }
            connection
                .tx
                .try_send(Request {
                    bytes,
                    reply,
                    cancelled: cancelled.clone(),
                })
                .map_err(|_| "send_queue_full_or_closed")?;
        }
        match result.recv_timeout(Duration::from_secs(2)) {
            Ok(result) => result,
            Err(_) => {
                cancelled.store(true, Ordering::SeqCst);
                Err("send_timeout_or_disconnected".into())
            }
        }
    }
}

fn run_transport(
    mut port: Box<dyn Transport>,
    rx: mpsc::Receiver<Request>,
    stop: Arc<AtomicBool>,
    mut event: SerialEvent,
    emit: Emit,
) {
    let mut decoder = Decoder::default();
    let mut buffer = [0u8; 4096];
    let mut last = Instant::now();
    let mut fatal = None;
    while !stop.load(Ordering::SeqCst) {
        for _ in 0..8 {
            let Ok(request) = rx.try_recv() else {
                break;
            };
            if request.cancelled.load(Ordering::SeqCst) || stop.load(Ordering::SeqCst) {
                let _ = request.reply.send(Err("not_connected".into()));
                continue;
            }
            let result = port
                .write_all(&request.bytes)
                .map_err(|error| format!("write_failed: {error}"));
            if let Err(error) = &result {
                fatal = Some(error.clone());
            }
            let _ = request.reply.send(result);
            if fatal.is_some() {
                break;
            }
        }
        if fatal.is_some() {
            break;
        }
        match port.read(&mut buffer) {
            Ok(0) => {
                fatal = Some("device_disconnected".into());
                break;
            }
            Ok(size) => {
                for line in decoder.feed(&buffer[..size]) {
                    match line {
                        Ok(line) => {
                            event.lines.push(line);
                            if event.lines.len() == 256 {
                                emit(event.clone());
                                event.lines.clear();
                            }
                        }
                        Err(error) => {
                            let mut warning = event.clone();
                            warning.lines.clear();
                            warning.error = Some(error);
                            emit(warning);
                        }
                    }
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::TimedOut
                        | io::ErrorKind::WouldBlock
                        | io::ErrorKind::Interrupted
                ) => {}
            Err(error) => {
                fatal = Some(format!("read_failed: {error}"));
                break;
            }
        }
        if last.elapsed() >= Duration::from_millis(50) {
            if !event.lines.is_empty() {
                emit(event.clone());
                event.lines.clear();
            }
            last = Instant::now();
        }
    }
    stop.store(true, Ordering::SeqCst);
    // Release the OS handle before announcing disconnection.
    drop(port);
    // Preserve complete lines received just before a disconnect/EOF between batches.
    if !event.lines.is_empty() {
        emit(event.clone());
    }
    event.connected = false;
    event.lines.clear();
    event.error = fatal;
    emit(event);
}

#[tauri::command]
pub async fn serial_list_ports() -> Result<Vec<Port>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(windows)]
        {
            serialport::available_ports()
                .map(|ports| {
                    ports
                        .into_iter()
                        .map(|port| {
                            let label = match port.port_type {
                                serialport::SerialPortType::UsbPort(info) => format!(
                                    "{} — {}",
                                    port.port_name,
                                    info.product.unwrap_or_else(|| "USB serial".into())
                                ),
                                _ => port.port_name.clone(),
                            };
                            Port {
                                name: port.port_name,
                                label,
                            }
                        })
                        .collect()
                })
                .map_err(|error| error.to_string())
        }
        #[cfg(not(windows))]
        {
            Err("windows_only".into())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn serial_connect(
    app: AppHandle,
    owner: String,
    port: String,
    baud_rate: u32,
) -> Result<Session, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let emitter_app = app.clone();
            let emit: Emit = Arc::new(move |event| {
                let _ = emitter_app.emit(EVENT, event);
            });
            app.state::<SerialManager>().connect_with(
                owner,
                port.clone(),
                baud_rate,
                || {
                    // Never expose arbitrary device/file paths as COM ports.
                    if !serialport::available_ports()
                        .map_err(|e| e.to_string())?
                        .iter()
                        .any(|item| item.port_name == port)
                    {
                        return Err("port_not_found".into());
                    }
                    serialport::new(&port, baud_rate)
                        .data_bits(serialport::DataBits::Eight)
                        .parity(serialport::Parity::None)
                        .stop_bits(serialport::StopBits::One)
                        .flow_control(serialport::FlowControl::None)
                        .preserve_dtr_on_open()
                        .timeout(Duration::from_millis(50))
                        .open()
                        .map(|port| Box::new(port) as Box<dyn Transport>)
                        .map_err(|error| format!("open_failed: {error}"))
                },
                emit,
            )
        }
        #[cfg(not(windows))]
        {
            let _ = (app, owner, port, baud_rate);
            Err("windows_only".into())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn serial_disconnect(app: AppHandle, owner: String, release: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SerialManager>().disconnect(&owner, release)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn serial_write_line(
    app: AppHandle,
    owner: String,
    session: String,
    text: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<SerialManager>()
            .write_line(&owner, &session, &text)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn final_complete_lines_are_delivered_before_disconnect() {
        let (_, rx) = mpsc::sync_channel(1);
        let events = Arc::new(Mutex::new(Vec::new()));
        let received = events.clone();
        run_transport(
            Box::new(io::Cursor::new(b"{\"value\":42}\r\n".to_vec())),
            rx,
            Arc::new(AtomicBool::new(false)),
            SerialEvent {
                owner: "editor".into(),
                session: "1".into(),
                connected: true,
                lines: vec![],
                error: None,
            },
            Arc::new(move |event| received.lock().unwrap().push(event)),
        );
        let events = events.lock().unwrap();
        assert_eq!(events.len(), 2);
        assert!(events[0].connected);
        assert_eq!(events[0].lines, vec!["{\"value\":42}"]);
        assert!(!events[1].connected);
    }
    #[test]
    fn line_framing_recovers_after_utf8_and_size_errors() {
        let mut decoder = Decoder::default();
        assert!(decoder.feed(b"{\"value\":").is_empty());
        assert_eq!(
            decoder.feed(b"1}\r\nsecond\n"),
            vec![Ok("{\"value\":1}".into()), Ok("second".into())]
        );
        assert!(decoder.feed(&[0xe4]).is_empty());
        assert_eq!(decoder.feed(&[0xb8, 0xad, b'\n']), vec![Ok("中".into())]);
        assert_eq!(
            decoder.feed(&[0xff, b'\n']),
            vec![Err("invalid_utf8".into())]
        );
        assert_eq!(
            decoder.feed(&vec![b'x'; MAX_LINE + 2]),
            vec![Err("line_too_long".into())]
        );
        assert_eq!(
            decoder.feed(b"ignored\nrecovered\n"),
            vec![Ok("recovered".into())]
        );
        assert!(decoder.feed(&vec![b'x'; MAX_LINE]).is_empty());
        assert_eq!(decoder.feed(b"\r\n")[0].as_ref().unwrap().len(), MAX_LINE);
        assert_eq!(encode_line("你好").unwrap(), "你好\n".as_bytes());
        assert!(encode_line("one\ntwo").is_err());
        assert!(encode_line(&"x".repeat(MAX_LINE + 1)).is_err());
    }

    struct MockPort {
        writes: Arc<Mutex<Vec<u8>>>,
        dropped: Arc<AtomicBool>,
        fail: bool,
    }
    impl Read for MockPort {
        fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
            thread::sleep(Duration::from_millis(2));
            if self.fail {
                Err(io::Error::new(io::ErrorKind::BrokenPipe, "unplugged"))
            } else {
                Err(io::ErrorKind::TimedOut.into())
            }
        }
    }
    impl Write for MockPort {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            self.writes.lock().unwrap().extend_from_slice(data);
            Ok(data.len())
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    impl Drop for MockPort {
        fn drop(&mut self) {
            self.dropped.store(true, Ordering::SeqCst);
        }
    }

    #[test]
    fn ownership_disconnect_and_late_connections_are_safe() {
        let manager = SerialManager::default();
        let writes = Arc::new(Mutex::new(vec![]));
        let dropped = Arc::new(AtomicBool::new(false));
        let open = || {
            Ok(Box::new(MockPort {
                writes: writes.clone(),
                dropped: dropped.clone(),
                fail: false,
            }) as Box<dyn Transport>)
        };
        let session = manager
            .connect_with(
                "editor-1".into(),
                "mock".into(),
                115200,
                open,
                Arc::new(|_| {}),
            )
            .unwrap();
        assert!(manager
            .connect_with(
                "editor-2".into(),
                "mock".into(),
                115200,
                open,
                Arc::new(|_| {})
            )
            .is_err());
        assert!(manager
            .write_line("editor-2", &session.id, "LED:1")
            .is_err());
        manager
            .write_line("editor-1", &session.id, "LED:1")
            .unwrap();
        assert_eq!(*writes.lock().unwrap(), b"LED:1\n");
        manager.disconnect("editor-2", true).unwrap();
        assert!(!dropped.load(Ordering::SeqCst));
        manager.disconnect("editor-1", true).unwrap();
        assert!(dropped.load(Ordering::SeqCst));
        assert!(manager.write_line("editor-1", &session.id, "late").is_err());
        assert!(manager
            .connect_with(
                "editor-1".into(),
                "mock".into(),
                115200,
                open,
                Arc::new(|_| {})
            )
            .is_err());
    }

    #[test]
    fn unplug_emits_disconnected_and_releases_the_port() {
        let manager = SerialManager::default();
        let dropped = Arc::new(AtomicBool::new(false));
        let (tx, rx) = mpsc::channel();
        manager
            .connect_with(
                "editor".into(),
                "mock".into(),
                115200,
                || {
                    Ok(Box::new(MockPort {
                        writes: Arc::new(Mutex::new(vec![])),
                        dropped: dropped.clone(),
                        fail: true,
                    }))
                },
                Arc::new(move |event| {
                    tx.send(event).unwrap();
                }),
            )
            .unwrap();
        let event = rx.recv_timeout(Duration::from_secs(1)).unwrap();
        assert!(!event.connected);
        assert!(event.error.unwrap().contains("unplugged"));
        assert!(dropped.load(Ordering::SeqCst));
        manager.disconnect("editor", true).unwrap();
    }
    struct FailingWrite;
    impl Read for FailingWrite {
        fn read(&mut self, _: &mut [u8]) -> io::Result<usize> {
            thread::sleep(Duration::from_millis(2));
            Err(io::ErrorKind::TimedOut.into())
        }
    }
    impl Write for FailingWrite {
        fn write(&mut self, _: &[u8]) -> io::Result<usize> {
            Err(io::Error::new(io::ErrorKind::BrokenPipe, "write unplugged"))
        }
        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }
    #[test]
    fn failed_open_and_write_allow_explicit_reconnect() {
        let manager = SerialManager::default();
        assert!(manager
            .connect_with(
                "editor".into(),
                "mock".into(),
                115200,
                || Err("open_failed: busy".into()),
                Arc::new(|_| {})
            )
            .is_err());
        let (tx, rx) = mpsc::channel();
        let session = manager
            .connect_with(
                "editor".into(),
                "mock".into(),
                115200,
                || Ok(Box::new(FailingWrite)),
                Arc::new(move |event| {
                    let _ = tx.send(event);
                }),
            )
            .unwrap();
        assert!(manager
            .write_line("editor", &session.id, "LED:1")
            .unwrap_err()
            .starts_with("write_failed"));
        assert!(!rx.recv_timeout(Duration::from_secs(1)).unwrap().connected);
        let dropped = Arc::new(AtomicBool::new(false));
        let next = manager
            .connect_with(
                "editor".into(),
                "mock".into(),
                115200,
                || {
                    Ok(Box::new(MockPort {
                        writes: Arc::new(Mutex::new(vec![])),
                        dropped: dropped.clone(),
                        fail: false,
                    }))
                },
                Arc::new(|_| {}),
            )
            .unwrap();
        assert_ne!(session.id, next.id);
        assert!(manager.write_line("editor", &session.id, "stale").is_err());
        drop(manager);
        assert!(dropped.load(Ordering::SeqCst));
    }
}
