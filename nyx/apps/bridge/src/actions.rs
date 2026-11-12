//! Browser on the Nyx control interface (API 2, nyx-core's nyx-actions contract), for
//! `nyx browser …`, Glimpse and Nyx Assistant: open a web address, search, or open a private
//! window. D-Bus starts `nyx-browser-bridge actions` for a call; it starts the browser with
//! fixed arguments and quits when idle. Only http and https addresses get through, and each
//! action sends something off the computer, so callers ask first.

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{Value, json};
use zbus::{fdo, interface};

pub const BUS: &str = "io.github.design_nexus.nyx.Browser";
pub const PATH: &str = "/io/github/design_nexus/nyx/Browser";
const APP_ID: &str = "io.github.design_nexus.nyx.Browser";
/// Quiet this long, it quits; D-Bus starts it again for the next call.
const IDLE: Duration = Duration::from_secs(60);
const MAX_QUERY: usize = 1024;

pub fn description() -> Value {
    let url = json!({"type": "string", "description": "An http or https address"});
    json!({
        "tools": [
            {"name": "browser.open", "description": "Open a web page in Browser.",
             "inputSchema": {"type": "object", "properties": {"url": url}, "required": ["url"], "additionalProperties": false},
             "annotations": {"title": "Open a web page", "openWorldHint": true},
             "x-nyx": {"risk": "external", "aliases": ["go", "visit"], "positional": ["url"], "icon": "web-browser-symbolic", "result": "none"}},
            {"name": "browser.search", "description": "Search the web in Browser, with its search engine.",
             "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"], "additionalProperties": false},
             "annotations": {"title": "Search the web", "openWorldHint": true},
             "x-nyx": {"risk": "external", "aliases": ["find"], "positional": ["query"], "icon": "system-search-symbolic", "result": "none"}},
            {"name": "browser.private", "description": "Open a private window, at a web page if one is given.",
             "inputSchema": {"type": "object", "properties": {"url": url}, "additionalProperties": false},
             "annotations": {"title": "Open a private window", "openWorldHint": true},
             "x-nyx": {"risk": "external", "aliases": ["incognito"], "positional": ["url"], "result": "none"}}
        ],
        "nyx": {"api": 2, "app": APP_ID, "name": "Browser", "icon": APP_ID, "namespaces": ["browser"], "aliases": ["web"],
                "bus_name": BUS, "object_path": PATH, "activation": "dbus", "open": {"action": "browser.open"}}
    })
}

/// The browser's arguments for an action, or what's wrong with the call.
pub fn arguments(action: &str, args: &Value) -> Result<Vec<String>, (&'static str, String)> {
    let url = |required: bool| -> Result<Option<String>, (&'static str, String)> {
        match args.get("url").and_then(Value::as_str) {
            Some(url) => {
                crate::protocol::check_web_url(url).map(|()| Some(url.to_string())).map_err(|r| ("invalid_arguments", r.message))
            }
            None if required => Err(("invalid_arguments", "Give a web address (url).".into())),
            None => Ok(None),
        }
    };
    match action {
        "browser.open" => Ok(vec!["--new-tab".into(), url(true)?.unwrap_or_default()]),
        "browser.private" => Ok(["--private-window".to_string()].into_iter().chain(url(false)?).collect()),
        "browser.search" => {
            let query = args.get("query").and_then(Value::as_str).map(str::trim).unwrap_or_default();
            if query.is_empty() || query.len() > MAX_QUERY || query.chars().any(char::is_control) {
                return Err(("invalid_arguments", "Give something to search for (query).".into()));
            }
            Ok(vec!["--search".into(), query.into()])
        }
        other => Err(("unknown_action", format!("Browser has no action {other}"))),
    }
}

fn error(kind: &str, message: impl Into<String>) -> String {
    json!({"error": {"kind": kind, "message": message.into()}}).to_string()
}

/// The browser beside this program, as a package installs them, else on PATH.
fn browser() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("nyx-browser")))
        .filter(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from("nyx-browser"))
}

struct Control {
    last_call: Arc<AtomicU64>,
}

#[interface(name = "io.github.design_nexus.nyx.Control")]
impl Control {
    async fn describe(&self) -> String {
        self.last_call.store(now(), Ordering::Relaxed);
        description().to_string()
    }

    async fn invoke(&self, action: &str, arguments: &str, options: &str) -> String {
        self.last_call.store(now(), Ordering::Relaxed);
        let args: Value = serde_json::from_str(arguments).unwrap_or(Value::Null);
        let confirmed = serde_json::from_str::<Value>(options).ok().and_then(|o| o["confirmed"].as_bool()).unwrap_or(false);
        let argv = match self::arguments(action, &args) {
            Ok(argv) => argv,
            Err((kind, message)) => return error(kind, message),
        };
        if !confirmed {
            return error("confirmation_required", format!("{action} opens the web, so it needs your go-ahead first"));
        }
        let started =
            Command::new(browser()).args(&argv).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn();
        match started {
            Ok(_) => json!({"ok": null}).to_string(),
            Err(_) => error("failed", "Browser isn't installed"),
        }
    }

    async fn state(&self, topic: &str) -> String {
        error("unknown_action", format!("Browser has no topic {topic}"))
    }

    async fn watch(&self, topic: &str) -> fdo::Result<u32> {
        Err(fdo::Error::InvalidArgs(format!("Browser has no topic {topic}")))
    }

    async fn unwatch(&self, _topic: &str) {}
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn run(args: &[String]) -> std::process::ExitCode {
    if args.iter().any(|a| a == "--describe") {
        println!("{}", serde_json::to_string_pretty(&description()).unwrap_or_default());
        return std::process::ExitCode::SUCCESS;
    }
    let last_call = Arc::new(AtomicU64::new(now()));
    let control = Control { last_call: Arc::clone(&last_call) };
    let connection = zbus::blocking::connection::Builder::session()
        .and_then(|b| b.name(BUS))
        .and_then(|b| b.serve_at(PATH, control))
        .and_then(|b| b.build());
    let Ok(_connection) = connection else {
        eprintln!("nyx-browser-bridge: couldn't take {BUS} on the session bus");
        return std::process::ExitCode::FAILURE;
    };
    loop {
        std::thread::sleep(Duration::from_secs(5));
        if now().saturating_sub(last_call.load(Ordering::Relaxed)) >= IDLE.as_secs() {
            return std::process::ExitCode::SUCCESS;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_only_web_addresses() {
        assert_eq!(
            arguments("browser.open", &json!({"url": "https://example.com"})).unwrap(),
            ["--new-tab", "https://example.com"]
        );
        for bad in ["file:///etc/passwd", "javascript:alert(1)", "chrome://browser/content/browser.xhtml", "about:config"] {
            assert_eq!(arguments("browser.open", &json!({"url": bad})).unwrap_err().0, "invalid_arguments", "{bad}");
        }
        assert_eq!(arguments("browser.open", &json!({})).unwrap_err().0, "invalid_arguments");
    }

    #[test]
    fn a_private_window_needs_no_address() {
        assert_eq!(arguments("browser.private", &json!({})).unwrap(), ["--private-window"]);
        assert_eq!(arguments("browser.private", &json!({"url": "https://a.b"})).unwrap(), ["--private-window", "https://a.b"]);
    }

    #[test]
    fn a_search_is_one_argument() {
        assert_eq!(arguments("browser.search", &json!({"query": " rust; rm -rf ~ "})).unwrap(), ["--search", "rust; rm -rf ~"]);
        assert!(arguments("browser.search", &json!({"query": "a\nb"})).is_err());
        assert!(arguments("browser.search", &json!({"query": ""})).is_err());
        assert_eq!(arguments("browser.nope", &json!({})).unwrap_err().0, "unknown_action");
    }

    #[test]
    fn the_description_names_every_action_in_its_namespace() {
        let d = description();
        for tool in d["tools"].as_array().unwrap() {
            assert!(tool["name"].as_str().unwrap().starts_with("browser."));
            assert_eq!(tool["x-nyx"]["risk"], "external");
        }
        assert_eq!(d["nyx"]["bus_name"], BUS);
    }
}
