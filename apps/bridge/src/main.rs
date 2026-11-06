//! The native messaging host: connects the Nyx extension to Share, Capture and Assistant. A
//! browser starts it and talks on stdin and stdout: a 32-bit native-endian length, then JSON.
//! Only the fixed operations in `protocol` exist. There's no shell and no way to name a program.

mod assistant;
mod protocol;

use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use nyx_share_client::{Client, Content, ContentKind, ShareOptions};
use protocol::{Group, MAX_FRAME, Op, Refusal};
use serde_json::{Value, json};

/// The only extension this host answers. Firefox names its caller in the last argument.
const EXTENSION_ID: &str = "nyx-integration@design-nexus.github.io";
/// Browsers that may start the host, by executable name.
const BROWSERS: &[&str] = &["zen-bin", "zen", "firefox", "firefox-bin"];
/// Chromium-family and Gecko browsers refuse messages to an extension above this.
const MAX_REPLY: usize = 1024 * 1024;
const APP_NAME: &str = "Browser";

static CAPTURES: AtomicU64 = AtomicU64::new(0);

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if !caller_allowed(&args) {
        eprintln!("nyx-browser-bridge: refused an unknown extension");
        std::process::exit(1);
    }
    if !parent_is_browser() {
        eprintln!("nyx-browser-bridge: refused a caller that isn't a browser");
        std::process::exit(1);
    }

    let mut input = std::io::stdin().lock();
    let output = Arc::new(Mutex::new(std::io::stdout()));
    while let Some(frame) = read_frame(&mut input) {
        // Each request runs on its own thread: a question can take minutes, and shouldn't hold
        // up the theme or a share.
        let output = Arc::clone(&output);
        std::thread::spawn(move || {
            let reply = handle(&frame);
            let mut output = output.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            if write_frame(&mut *output, &reply).is_err() {
                std::process::exit(0);
            }
        });
    }
}

fn caller_allowed(args: &[String]) -> bool {
    args.last().is_some_and(|caller| caller == EXTENSION_ID)
}

fn parent_is_browser() -> bool {
    let Ok(exe) = std::fs::read_link(format!("/proc/{}/exe", std::os::unix::process::parent_id())) else {
        return false;
    };
    exe.file_name().is_some_and(|name| BROWSERS.iter().any(|b| *b == name))
}

fn read_frame(input: &mut impl Read) -> Option<Vec<u8>> {
    let mut len = [0u8; 4];
    input.read_exact(&mut len).ok()?;
    let len = u32::from_ne_bytes(len) as usize;
    if len > MAX_FRAME {
        return None;
    }
    let mut frame = vec![0u8; len];
    input.read_exact(&mut frame).ok()?;
    Some(frame)
}

fn write_frame(output: &mut impl Write, reply: &Value) -> std::io::Result<()> {
    let mut bytes = reply.to_string().into_bytes();
    if bytes.len() > MAX_REPLY {
        let id = reply.get("id").cloned().unwrap_or(Value::Null);
        bytes =
            json!({"id": id, "ok": false, "code": "unavailable", "error": "The reply was too long."}).to_string().into_bytes();
    }
    output.write_all(&(bytes.len() as u32).to_ne_bytes())?;
    output.write_all(&bytes)?;
    output.flush()
}

fn handle(frame: &[u8]) -> Value {
    let (id, op) = protocol::parse(frame);
    let result = op.and_then(|op| {
        op.validate()?;
        check_allowed(&op, &integrations_file())?;
        let name = op.name();
        run(op).inspect_err(|refusal| eprintln!("nyx-browser-bridge: {name}: {}", refusal.code))
    });
    match result {
        Ok(data) => json!({"id": id, "ok": true, "data": data}),
        Err(refusal) => json!({"id": id, "ok": false, "code": refusal.code, "error": refusal.message}),
    }
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

fn config_home() -> PathBuf {
    std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".config"))
}

fn state_home() -> PathBuf {
    std::env::var_os("XDG_STATE_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/state"))
}

fn integrations_file() -> PathBuf {
    config_home().join("nyx-browser/integrations.json")
}

/// Settings turns groups off in `integrations.json` (`{"assistant": false}`). A group not listed
/// is on. A file that can't be read turns everything off: it's a permission, so it fails closed.
fn check_allowed(op: &Op, file: &Path) -> Result<(), Refusal> {
    let key = match op.group() {
        Group::Always => return Ok(()),
        Group::Share => "share",
        Group::Capture => "capture",
        Group::Assistant => "assistant",
    };
    let allowed = match std::fs::read_to_string(file) {
        Ok(text) => serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| v.get(key).map(|on| on == true).or(Some(true)))
            .unwrap_or(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
        Err(_) => false,
    };
    if allowed { Ok(()) } else { Err(Refusal::denied("This is turned off in Settings.")) }
}

fn run(op: Op) -> Result<Value, Refusal> {
    match op {
        Op::Hello {} => Ok(json!({"version": env!("CARGO_PKG_VERSION")})),
        Op::Theme {} => {
            let tokens = std::fs::read_to_string(state_home().join("nyx-browser/tokens.css")).unwrap_or_default();
            Ok(json!({"tokens": tokens}))
        }
        Op::SharePage { url, .. } => {
            let mut content = Content::new();
            content.url(url);
            share(&content)
        }
        Op::ShareText { text } => {
            let mut content = Content::new();
            content.text(text);
            share(&content)
        }
        Op::ShareImage { data } => {
            let bytes = protocol::decode_png(&data)?;
            let mut content = Content::new();
            content.bytes(ContentKind::Image, "screenshot.png", Some("image/png"), &bytes).map_err(|_| share_failed())?;
            share(&content)
        }
        Op::ShareDownload { path } => {
            let file = protocol::check_download(&path, &home())?;
            let mut content = Content::new();
            content.file(file).map_err(|_| Refusal::invalid("That file couldn't be opened."))?;
            share(&content)
        }
        Op::CaptureRegion {} => start_capture(&["--region"]),
        Op::CaptureText {} => start_capture(&["--ocr"]),
        Op::CaptureOpen { data } => {
            let bytes = protocol::decode_png(&data)?;
            let file = write_capture(&bytes).map_err(|_| Refusal::unavailable("The screenshot couldn't be saved."))?;
            let file = file.to_str().ok_or_else(|| Refusal::unavailable("The screenshot couldn't be saved."))?.to_string();
            start_capture(&["--file", &file])
        }
        Op::WeatherCached {} => weather_cached(),
        Op::AssistantAsk { question, page_url, page_title, page_text } => {
            let nonce = random_hex();
            let message = assistant::prompt(&question, &page_url, &page_title, &page_text, &nonce);
            let text = assistant::ask(&assistant::socket(), &format!("browser-{nonce}"), message)?;
            Ok(json!({"text": text}))
        }
    }
}

/// What Weather last fetched. It's read from Weather's cache and makes no request of its own.
fn weather_cached() -> Result<Value, Refusal> {
    let unavailable = || Refusal::unavailable("There's no weather to show.");
    let mut child = Command::new("nyx-weather")
        .arg("--waybar-cached")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| unavailable())?;
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() < deadline => std::thread::sleep(std::time::Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(unavailable());
            }
        }
    }
    let mut output = String::new();
    child.stdout.take().ok_or_else(unavailable)?.take(64 * 1024).read_to_string(&mut output).map_err(|_| unavailable())?;
    parse_weather(&output).ok_or_else(unavailable)
}

/// The short reading and its details, as plain strings. Anything else in the output is ignored.
fn parse_weather(output: &str) -> Option<Value> {
    let weather: Value = serde_json::from_str(output.trim()).ok()?;
    let text = weather.get("text")?.as_str()?.trim();
    if text.is_empty() {
        return None;
    }
    let details = weather.get("tooltip").and_then(Value::as_str).unwrap_or_default();
    Some(json!({"text": text, "details": details}))
}

fn share_failed() -> Refusal {
    Refusal::unavailable("Share isn't available.")
}

fn share(content: &Content) -> Result<Value, Refusal> {
    let client = Client::connect().map_err(|_| share_failed())?;
    let options = ShareOptions { app_name: Some(APP_NAME.into()), ..Default::default() };
    client.share(content, &options).map_err(|_| share_failed())?;
    Ok(json!({}))
}

/// Starts Capture on its own; it isn't waited for, and it's found on PATH like any Nyx app. The
/// arguments are fixed flags and a file name this program made.
fn start_capture(args: &[&str]) -> Result<Value, Refusal> {
    Command::new("nyx-capture")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| Refusal::unavailable("Capture isn't installed."))?;
    Ok(json!({}))
}

/// A private file Capture can open. Runtime folders are the user's alone and empty at login.
fn write_capture(bytes: &[u8]) -> std::io::Result<PathBuf> {
    use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
    let runtime = std::env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from).ok_or(std::io::ErrorKind::NotFound)?;
    let dir = runtime.join("nyx-browser");
    std::fs::DirBuilder::new().recursive(true).mode(0o700).create(&dir)?;
    let name = format!("capture-{}-{}.png", std::process::id(), CAPTURES.fetch_add(1, Ordering::Relaxed));
    let path = dir.join(name);
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(&path)?;
    file.write_all(bytes)?;
    Ok(path)
}

fn random_hex() -> String {
    let mut bytes = [0u8; 16];
    let read = std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut bytes));
    if read.is_err() {
        // Without randomness the marker is guessable, though `prompt` still checks it against
        // the page; a question is never worth failing for this.
        bytes[..8].copy_from_slice(&(std::process::id() as u64).to_ne_bytes());
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn answers_only_its_extension() {
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(caller_allowed(&args(&["/path/manifest.json", EXTENSION_ID])));
        assert!(!caller_allowed(&args(&["/path/manifest.json", "other@example.com"])));
        assert!(!caller_allowed(&args(&[EXTENSION_ID, "other@example.com"])));
        assert!(!caller_allowed(&[]));
    }

    #[test]
    fn frames_round_trip_and_oversized_ones_end_the_connection() {
        let mut out = Vec::new();
        write_frame(&mut out, &json!({"id":1})).unwrap();
        let mut input = out.as_slice();
        assert_eq!(read_frame(&mut input).unwrap(), br#"{"id":1}"#);
        assert!(read_frame(&mut input).is_none());
        let huge = ((MAX_FRAME + 1) as u32).to_ne_bytes();
        assert!(read_frame(&mut huge.as_slice()).is_none());
        let short = [5u8, 0, 0, 0, b'{'];
        assert!(read_frame(&mut short.as_slice()).is_none());
    }

    #[test]
    fn a_long_reply_becomes_an_error_with_its_id() {
        let mut out = Vec::new();
        write_frame(&mut out, &json!({"id": 9, "ok": true, "data": "x".repeat(MAX_REPLY)})).unwrap();
        let reply: Value = serde_json::from_slice(&out[4..]).unwrap();
        assert_eq!(reply["id"], 9);
        assert_eq!(reply["ok"], false);
    }

    #[test]
    fn replies_carry_a_refusal_for_bad_requests() {
        let reply = handle(br#"{"id":3,"op":"exec","command":"sh"}"#);
        assert_eq!(reply["id"], 3);
        assert_eq!(reply["ok"], false);
        assert_eq!(reply["code"], "invalid");
        assert_eq!(handle(b"garbage")["id"], Value::Null);
        assert_eq!(handle(br#"{"id":4,"op":"share_page","url":"file:///etc/passwd","title":""}"#)["code"], "invalid");
    }

    #[test]
    fn reads_weather_output() {
        let reply = parse_weather(r#"{"alt":"x","text":"⛅ 63°","tooltip":"Calera\nHigh: 71°"}"#).unwrap();
        assert_eq!(reply["text"], "⛅ 63°");
        assert_eq!(reply["details"], "Calera\nHigh: 71°");
        assert!(reply.get("alt").is_none());
        assert!(parse_weather("not json").is_none());
        assert!(parse_weather(r#"{"text":"  "}"#).is_none());
        assert!(parse_weather("{}").is_none());
    }

    #[test]
    fn permissions_fail_closed() {
        let dir = std::env::temp_dir().join(format!("nyx-browser-perm-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("integrations.json");
        let ask = Op::AssistantAsk {
            question: "q".into(),
            page_url: "https://a.b".into(),
            page_title: "".into(),
            page_text: "".into(),
        };
        let share = Op::ShareText { text: "x".into() };

        // No file: everything's on, as installed.
        assert!(check_allowed(&ask, &file).is_ok());
        std::fs::write(&file, r#"{"assistant":false}"#).unwrap();
        assert_eq!(check_allowed(&ask, &file).unwrap_err().code, "denied");
        assert!(check_allowed(&share, &file).is_ok());
        assert!(check_allowed(&Op::Theme {}, &file).is_ok());
        // Only a literal true counts.
        std::fs::write(&file, r#"{"assistant":"yes"}"#).unwrap();
        assert!(check_allowed(&ask, &file).is_err());
        std::fs::write(&file, "not json").unwrap();
        assert!(check_allowed(&ask, &file).is_err());
        assert!(check_allowed(&share, &file).is_err());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn capture_files_are_private_and_never_reused() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("nyx-browser-run-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // SAFETY: only this test reads or sets this variable in this process.
        unsafe { std::env::set_var("XDG_RUNTIME_DIR", &dir) };
        let first = write_capture(b"one").unwrap();
        let second = write_capture(b"two").unwrap();
        assert_ne!(first, second);
        assert_eq!(std::fs::metadata(&first).unwrap().permissions().mode() & 0o777, 0o600);
        assert_eq!(std::fs::metadata(first.parent().unwrap()).unwrap().permissions().mode() & 0o777, 0o700);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
