//! A minimal Chrome DevTools Protocol client: launches Chrome with
//! `--remote-debugging-port=0`, connects to the browser's WebSocket and sends
//! commands as JSON. Pages are attached in flat mode, so every page command
//! and event travels over the one connection, tagged with its `sessionId`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

/// How long a single command may take before it fails.
const COMMAND_TIMEOUT: Duration = Duration::from_secs(180);

/// Puppeteer's default Chrome flags (as `chromiumoxide` passed them).
const DEFAULT_ARGS: &[&str] = &[
    "--disable-background-networking",
    "--enable-features=NetworkService,NetworkServiceInProcess",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    "--disable-component-extensions-with-background-pages",
    "--disable-default-apps",
    "--disable-dev-shm-usage",
    "--disable-features=TranslateUI",
    "--disable-hang-monitor",
    "--disable-ipc-flooding-protection",
    "--disable-popup-blocking",
    "--disable-prompt-on-repost",
    "--disable-renderer-backgrounding",
    "--disable-sync",
    "--force-color-profile=srgb",
    "--metrics-recording-only",
    "--no-first-run",
    "--enable-automation",
    "--password-store=basic",
    "--use-mock-keychain",
    "--enable-blink-features=IdleDetection",
    "--lang=en_US",
    "--disable-extensions",
    "--no-sandbox",
    "--disable-setuid-sandbox",
];

/// A failed command, a dropped connection or a launch failure.
#[derive(Debug)]
pub struct CdpError(pub String);

impl std::fmt::Display for CdpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

pub type CdpResult<T> = Result<T, CdpError>;

// ---------------------------------------------------------------------------
// finding and launching Chrome

/// Chrome/Chromium on `$CHROME`, on `PATH`, or in its usual install location.
pub fn default_executable() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("CHROME").map(PathBuf::from)
        && path.exists()
    {
        return Ok(path);
    }
    let names = [
        "chrome",
        "chrome-browser",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "msedge",
        "microsoft-edge",
        "microsoft-edge-stable",
    ];
    for name in names {
        if let Some(path) = find_on_path(name) {
            return Ok(path);
        }
    }
    let paths: &[&str] = if cfg!(target_os = "macos") {
        &[
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
    } else if cfg!(windows) {
        &[r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]
    } else {
        &["/opt/chromium.org/chromium", "/opt/google/chrome"]
    };
    paths
        .iter()
        .map(PathBuf::from)
        .find(|path| path.exists())
        .ok_or_else(|| "Could not auto detect a chrome executable".to_string())
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).find_map(|dir| {
        let candidates = if cfg!(windows) {
            vec![dir.join(format!("{name}.exe"))]
        } else {
            vec![dir.join(name)]
        };
        candidates.into_iter().find(|candidate| candidate.is_file())
    })
}

/// How to start Chrome.
pub struct LaunchConfig<'a> {
    pub executable: &'a Path,
    pub user_data_dir: &'a Path,
    pub headless: bool,
    /// Extra flags, with or without leading dashes.
    pub args: &'a [String],
    pub timeout: Duration,
}

/// A running Chrome and the connection to it.
pub struct Browser {
    pub connection: Connection,
    child: Child,
}

impl Browser {
    pub async fn launch(config: LaunchConfig<'_>) -> CdpResult<Browser> {
        let mut command = Command::new(config.executable);
        command
            .args(DEFAULT_ARGS)
            .arg("--remote-debugging-port=0")
            .arg(format!(
                "--user-data-dir={}",
                config.user_data_dir.display()
            ));
        if config.headless {
            command.args(["--headless=new", "--hide-scrollbars", "--mute-audio"]);
        }
        command
            .args(
                config
                    .args
                    .iter()
                    .map(|arg| format!("--{}", arg.trim_start_matches('-'))),
            )
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        let mut child = command
            .spawn()
            .map_err(|error| CdpError(error.to_string()))?;
        let stderr = child.stderr.take().expect("stderr is piped");
        let ws_url = tokio::time::timeout(config.timeout, devtools_url(stderr))
            .await
            .map_err(|_| CdpError("Browser launch timed out".into()))??;
        let connection = Connection::connect(&ws_url).await?;
        Ok(Browser { connection, child })
    }

    /// Asks Chrome to close, then makes sure it has exited.
    pub async fn close(mut self) {
        let _ = tokio::time::timeout(
            Duration::from_secs(10),
            self.connection.call(None, "Browser.close", json!({})),
        )
        .await;
        if tokio::time::timeout(Duration::from_secs(10), self.child.wait())
            .await
            .is_err()
        {
            let _ = self.child.kill().await;
        }
    }
}

/// Reads Chrome's stderr until it prints its DevTools URL, then keeps
/// draining it so Chrome never blocks on a full pipe.
async fn devtools_url(stderr: tokio::process::ChildStderr) -> CdpResult<String> {
    let mut lines = BufReader::new(stderr).lines();
    let mut output = String::new();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                if let Some(url) = line.trim().strip_prefix("DevTools listening on ") {
                    let url = url.to_string();
                    tokio::spawn(async move { while let Ok(Some(_)) = lines.next_line().await {} });
                    return Ok(url);
                }
                output.push_str(&line);
                output.push('\n');
            }
            _ => {
                return Err(CdpError(format!(
                    "Browser process exited before it was ready: {}",
                    output.trim()
                )));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// the connection

type Pending = oneshot::Sender<CdpResult<Value>>;

struct Listener {
    session: Option<String>,
    method: String,
    events: mpsc::UnboundedSender<Value>,
}

#[derive(Default)]
struct Routes {
    pending: HashMap<u64, Pending>,
    listeners: Vec<Listener>,
    closed: bool,
}

struct Shared {
    outgoing: mpsc::UnboundedSender<String>,
    next_id: AtomicU64,
    routes: Mutex<Routes>,
}

/// The browser connection; cheap to clone.
#[derive(Clone)]
pub struct Connection {
    shared: Arc<Shared>,
}

impl Connection {
    pub async fn connect(ws_url: &str) -> CdpResult<Connection> {
        let stream = websocket_connect(ws_url)
            .await
            .map_err(|error| CdpError(format!("Could not connect to the browser: {error}")))?;
        let (reader, writer) = tokio::io::split(stream);
        let (outgoing, outgoing_rx) = mpsc::unbounded_channel();
        let shared = Arc::new(Shared {
            outgoing,
            next_id: AtomicU64::new(1),
            routes: Mutex::new(Routes::default()),
        });
        tokio::spawn(write_loop(writer, outgoing_rx));
        tokio::spawn(read_loop(reader, shared.clone()));
        Ok(Connection { shared })
    }

    fn routes(&self) -> std::sync::MutexGuard<'_, Routes> {
        self.shared.routes.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Sends a command and waits for its result.
    pub async fn call(
        &self,
        session: Option<&str>,
        method: &str,
        params: Value,
    ) -> CdpResult<Value> {
        let id = self.shared.next_id.fetch_add(1, Ordering::Relaxed);
        let mut message = json!({"id": id, "method": method, "params": params});
        if let Some(session) = session {
            message["sessionId"] = json!(session);
        }
        let (tx, rx) = oneshot::channel();
        {
            let mut routes = self.routes();
            if routes.closed {
                return Err(CdpError("Target closed".into()));
            }
            routes.pending.insert(id, tx);
        }
        if self.shared.outgoing.send(message.to_string()).is_err() {
            self.routes().pending.remove(&id);
            return Err(CdpError("Target closed".into()));
        }
        match tokio::time::timeout(COMMAND_TIMEOUT, rx).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err(CdpError("Target closed".into())),
            Err(_) => {
                self.routes().pending.remove(&id);
                Err(CdpError(format!("{method}: Request timeout")))
            }
        }
    }

    /// The params of every `method` event from `session` (`None`: the
    /// browser itself) from now on. The stream ends when the connection does.
    pub fn listen(&self, session: Option<&str>, method: &str) -> mpsc::UnboundedReceiver<Value> {
        let (events, rx) = mpsc::unbounded_channel();
        let mut routes = self.routes();
        if !routes.closed {
            routes.listeners.push(Listener {
                session: session.map(str::to_string),
                method: method.to_string(),
                events,
            });
        }
        rx
    }
}

async fn write_loop(
    mut writer: impl AsyncWrite + Unpin,
    mut outgoing: mpsc::UnboundedReceiver<String>,
) {
    while let Some(text) = outgoing.recv().await {
        if write_frame(&mut writer, OPCODE_TEXT, text.as_bytes())
            .await
            .is_err()
        {
            break;
        }
    }
}

async fn read_loop(mut reader: impl AsyncRead + Unpin, shared: Arc<Shared>) {
    while let Ok(Some(text)) = read_message(&mut reader).await {
        let Ok(message) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        let mut routes = shared.routes.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(id) = message["id"].as_u64() {
            if let Some(pending) = routes.pending.remove(&id) {
                let result = match message.get("error") {
                    Some(error) => Err(CdpError(
                        error["message"]
                            .as_str()
                            .unwrap_or("Unknown error")
                            .to_string(),
                    )),
                    None => Ok(message.get("result").cloned().unwrap_or(Value::Null)),
                };
                let _ = pending.send(result);
            }
            continue;
        }
        let Some(method) = message["method"].as_str() else {
            continue;
        };
        let session = message["sessionId"].as_str();
        let params = message.get("params").cloned().unwrap_or(Value::Null);
        routes.listeners.retain(|listener| {
            if listener.method != method || listener.session.as_deref() != session {
                return !listener.events.is_closed();
            }
            listener.events.send(params.clone()).is_ok()
        });
    }
    let mut routes = shared.routes.lock().unwrap_or_else(|e| e.into_inner());
    routes.closed = true;
    routes.listeners.clear();
    for (_, pending) in routes.pending.drain() {
        let _ = pending.send(Err(CdpError("Target closed".into())));
    }
}

/// A page session (or the browser itself), to send commands to.
#[derive(Clone)]
pub struct Session {
    pub connection: Connection,
    pub id: Option<String>,
}

impl Session {
    pub async fn execute(&self, method: &str, params: Value) -> CdpResult<Value> {
        self.connection
            .call(self.id.as_deref(), method, params)
            .await
    }

    pub fn listen(&self, method: &str) -> mpsc::UnboundedReceiver<Value> {
        self.connection.listen(self.id.as_deref(), method)
    }
}

// ---------------------------------------------------------------------------
// WebSocket (RFC 6455), client side, as much as CDP needs

const OPCODE_CONTINUATION: u8 = 0x0;
const OPCODE_TEXT: u8 = 0x1;
const OPCODE_BINARY: u8 = 0x2;
const OPCODE_CLOSE: u8 = 0x8;

/// Opens `ws://host:port/path` and completes the opening handshake.
async fn websocket_connect(ws_url: &str) -> std::io::Result<TcpStream> {
    let invalid =
        |message: &str| std::io::Error::new(std::io::ErrorKind::InvalidData, message.to_string());
    let rest = ws_url
        .strip_prefix("ws://")
        .ok_or_else(|| invalid("expected a ws:// URL"))?;
    let (host, path) = rest.split_at(rest.find('/').unwrap_or(rest.len()));
    let path = if path.is_empty() { "/" } else { path };
    let mut stream = TcpStream::connect(host).await?;
    stream.set_nodelay(true)?;
    let key = base64::engine::general_purpose::STANDARD.encode(rand::random::<[u8; 16]>());
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
         Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).await?;
    // read the response head byte by byte so no frame data is consumed
    let mut head = Vec::new();
    while !head.ends_with(b"\r\n\r\n") {
        if head.len() > 16 * 1024 {
            return Err(invalid("handshake response too large"));
        }
        head.push(stream.read_u8().await?);
    }
    let head = String::from_utf8_lossy(&head);
    if !head.starts_with("HTTP/1.1 101") {
        let status = head.lines().next().unwrap_or_default().to_string();
        return Err(invalid(&format!("handshake failed: {status}")));
    }
    Ok(stream)
}

/// Writes one masked frame (clients must mask).
async fn write_frame(
    writer: &mut (impl AsyncWrite + Unpin),
    opcode: u8,
    payload: &[u8],
) -> std::io::Result<()> {
    let mut frame = Vec::with_capacity(payload.len() + 14);
    frame.push(0x80 | opcode);
    let length = payload.len();
    if length < 126 {
        frame.push(0x80 | length as u8);
    } else if length <= u16::MAX as usize {
        frame.push(0x80 | 126);
        frame.extend_from_slice(&(length as u16).to_be_bytes());
    } else {
        frame.push(0x80 | 127);
        frame.extend_from_slice(&(length as u64).to_be_bytes());
    }
    let mask: [u8; 4] = rand::random();
    frame.extend_from_slice(&mask);
    frame.extend(
        payload
            .iter()
            .enumerate()
            .map(|(i, byte)| byte ^ mask[i % 4]),
    );
    writer.write_all(&frame).await?;
    writer.flush().await
}

/// Reads the next complete text or binary message.
/// `None` when the server closes the connection.
async fn read_message(reader: &mut (impl AsyncRead + Unpin)) -> std::io::Result<Option<String>> {
    let mut message = Vec::new();
    loop {
        let mut header = [0u8; 2];
        reader.read_exact(&mut header).await?;
        let fin = header[0] & 0x80 != 0;
        let opcode = header[0] & 0x0F;
        let masked = header[1] & 0x80 != 0;
        let length = match header[1] & 0x7F {
            126 => reader.read_u16().await? as u64,
            127 => reader.read_u64().await?,
            length => length as u64,
        };
        let mut mask = [0u8; 4];
        if masked {
            reader.read_exact(&mut mask).await?;
        }
        let mut payload = vec![0u8; length as usize];
        reader.read_exact(&mut payload).await?;
        if masked {
            for (i, byte) in payload.iter_mut().enumerate() {
                *byte ^= mask[i % 4];
            }
        }
        match opcode {
            OPCODE_TEXT | OPCODE_BINARY | OPCODE_CONTINUATION => {
                message.extend_from_slice(&payload);
                if fin {
                    return Ok(Some(String::from_utf8_lossy(&message).into_owned()));
                }
            }
            OPCODE_CLOSE => return Ok(None),
            // Chrome never pings, so control frames other than close are
            // skipped
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::duplex;

    #[tokio::test]
    async fn round_trips_frames_of_every_length_encoding() {
        for length in [0, 125, 126, 65_535, 65_536, 200_000] {
            let text = "x".repeat(length);
            let (mut client, mut server) = duplex(512 * 1024);
            write_frame(&mut client, OPCODE_TEXT, text.as_bytes())
                .await
                .unwrap();
            let read = read_message(&mut server).await.unwrap();
            assert_eq!(read.as_deref(), Some(text.as_str()), "length {length}");
        }
    }

    #[tokio::test]
    async fn joins_fragments_and_stops_at_close() {
        let (mut client, mut server) = duplex(1024);
        // unmasked server frames: "he" + "llo", a ping in between, then close
        client
            .write_all(&[
                0x01, 2, b'h', b'e', 0x89, 0, 0x80, 3, b'l', b'l', b'o', 0x88, 0,
            ])
            .await
            .unwrap();
        assert_eq!(
            read_message(&mut server).await.unwrap().as_deref(),
            Some("hello")
        );
        assert_eq!(read_message(&mut server).await.unwrap(), None);
    }
}
