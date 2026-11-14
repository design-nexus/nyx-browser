//! Other browsers, for Browser's Open in:
//!
//! - `nyx-browser-bridge browsers` prints, as JSON, the installed browsers that open web links:
//!   desktop entries taking `x-scheme-handler/https`, without Browser itself or entries hidden
//!   from the launcher (wrappers such as a "default browser" launcher).
//! - `nyx-browser-bridge open-in ID URL [--private]` opens a web page in one of them, in its
//!   private window when it has one.
//!
//! Only a listed entry's own command runs, with the address as its one argument; there's no shell.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};

use serde_json::{Value, json};

use crate::protocol::{Refusal, check_web_url};

/// Browser's own desktop entry, which isn't "another browser".
const OWN_ID: &str = "io.github.design_nexus.nyx.Browser";

#[derive(Debug, PartialEq)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    exec: String,
    private_exec: Option<String>,
}

pub fn run_list() -> ExitCode {
    let list: Vec<Value> = installed()
        .iter()
        .map(|e| json!({"id": e.id, "name": e.name, "icon": icon_file(e.icon.as_deref()), "private": e.private_exec.is_some()}))
        .collect();
    println!("{}", json!(list));
    ExitCode::SUCCESS
}

pub fn run_open(args: &[String]) -> ExitCode {
    let result = match args {
        [id, url] => open(id, url, false),
        [id, url, flag] if flag == "--private" => open(id, url, true),
        _ => Err(Refusal::invalid("Name a browser and a web address.")),
    };
    match result {
        Ok(()) => {
            println!("{{}}");
            ExitCode::SUCCESS
        }
        Err(refusal) => {
            println!("{}", json!({"code": refusal.code, "error": refusal.message}));
            ExitCode::FAILURE
        }
    }
}

fn open(id: &str, url: &str, private: bool) -> Result<(), Refusal> {
    check_web_url(url)?;
    let entry = installed()
        .into_iter()
        .find(|e| e.id == id)
        .ok_or_else(|| Refusal::invalid("That browser isn't installed."))?;
    let exec = if private {
        entry.private_exec.as_deref().ok_or_else(|| Refusal::invalid("That browser has no private window."))?
    } else {
        &entry.exec
    };
    let argv = command(exec, url);
    let (program, rest) = argv.split_first().ok_or_else(|| Refusal::unavailable("That browser can't be started."))?;
    Command::new(program)
        .args(rest)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| Refusal::unavailable(format!("{} couldn't be started.", entry.name)))?;
    Ok(())
}

fn data_dirs() -> Vec<PathBuf> {
    let home = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")));
    let system = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    home.into_iter().chain(system.split(':').filter(|d| !d.is_empty()).map(PathBuf::from)).collect()
}

/// The browsers, each id once: the user's own entries come first and replace the system's.
pub fn installed() -> Vec<Entry> {
    let mut seen = HashSet::new();
    let mut list = Vec::new();
    for dir in data_dirs() {
        let Ok(read) = std::fs::read_dir(dir.join("applications")) else { continue };
        let mut files: Vec<PathBuf> = read.flatten().map(|f| f.path()).collect();
        files.sort();
        for path in files {
            let Some(id) = path.file_name().and_then(|n| n.to_str()).and_then(|n| n.strip_suffix(".desktop")) else {
                continue;
            };
            if !seen.insert(id.to_string()) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(&path) else { continue };
            if let Some(entry) = parse(id, &text) {
                list.push(entry);
            }
        }
    }
    list.sort_by_key(|e| e.name.to_lowercase());
    list
}

/// A desktop entry that's a browser, or None.
pub fn parse(id: &str, text: &str) -> Option<Entry> {
    if id == OWN_ID {
        return None;
    }
    let mut group = "";
    let mut main = std::collections::HashMap::new();
    let mut private_exec = None;
    for line in text.lines() {
        let line = line.trim();
        if let Some(name) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
            group = name;
            continue;
        }
        let Some((key, value)) = line.split_once('=') else { continue };
        let (key, value) = (key.trim(), value.trim());
        if group == "Desktop Entry" {
            main.entry(key.to_string()).or_insert_with(|| value.to_string());
        } else if group == "Desktop Action new-private-window" && key == "Exec" {
            private_exec = Some(value.to_string());
        }
    }
    let flag = |key: &str| main.get(key).is_some_and(|v| v == "true");
    if main.get("Type").is_some_and(|t| t != "Application") || flag("NoDisplay") || flag("Hidden") {
        return None;
    }
    let takes_web = main.get("MimeType").is_some_and(|m| m.split(';').any(|t| t == "x-scheme-handler/https"));
    // Web apps take links too; browsers say they're browsers.
    let browser = main.get("Categories").is_some_and(|c| c.split(';').any(|t| t == "WebBrowser"));
    let exec = main.get("Exec")?.clone();
    if !takes_web || !browser || exec.contains("nyx-browser") {
        return None;
    }
    Some(Entry {
        id: id.to_string(),
        name: main.get("Name")?.clone(),
        icon: main.get("Icon").cloned(),
        exec,
        private_exec,
    })
}

/// The entry's command with the address in place of its field code, or after it when it has none.
pub fn command(exec: &str, url: &str) -> Vec<String> {
    let mut placed = false;
    let mut argv = Vec::new();
    for word in split(exec) {
        match word.as_str() {
            "%u" | "%U" | "%f" | "%F" => {
                if !placed {
                    argv.push(url.to_string());
                    placed = true;
                }
            }
            "%i" | "%c" | "%k" | "%d" | "%D" | "%n" | "%N" | "%v" | "%m" => {}
            _ => argv.push(word.replace("%%", "%")),
        }
    }
    if !placed {
        argv.push(url.to_string());
    }
    argv
}

/// Splits an Exec value into words, as the desktop entry spec quotes them.
fn split(exec: &str) -> Vec<String> {
    let mut words = Vec::new();
    let mut word = String::new();
    let mut quoted = false;
    let mut chars = exec.chars();
    while let Some(c) = chars.next() {
        match c {
            '"' => quoted = !quoted,
            '\\' if quoted => {
                if let Some(next) = chars.next() {
                    word.push(next);
                }
            }
            ' ' | '\t' if !quoted => {
                if !word.is_empty() {
                    words.push(std::mem::take(&mut word));
                }
            }
            _ => word.push(c),
        }
    }
    if !word.is_empty() {
        words.push(word);
    }
    words
}

/// An icon file Browser can draw: the entry's own path, or the theme's largest of that name.
fn icon_file(name: Option<&str>) -> Option<String> {
    let name = name?;
    if name.starts_with('/') {
        return Path::new(name).exists().then(|| name.to_string());
    }
    for dir in data_dirs() {
        for size in ["scalable", "512x512", "256x256", "128x128", "96x96", "64x64", "48x48", "32x32"] {
            for ext in ["svg", "png"] {
                let path = dir.join(format!("icons/hicolor/{size}/apps/{name}.{ext}"));
                if path.exists() {
                    return path.to_str().map(String::from);
                }
            }
        }
        for ext in ["svg", "png"] {
            let path = dir.join(format!("pixmaps/{name}.{ext}"));
            if path.exists() {
                return path.to_str().map(String::from);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIREFOX: &str = "[Desktop Entry]\nName=Firefox\nName[de]=Feuerfuchs\nExec=/usr/lib/firefox/firefox %u\nIcon=firefox\nType=Application\nCategories=Network;WebBrowser;\nMimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;\n\n[Desktop Action new-private-window]\nName=New Private Window\nExec=/usr/lib/firefox/firefox --private-window %u\n";

    #[test]
    fn reads_a_browser_and_its_private_window() {
        let e = parse("firefox", FIREFOX).unwrap();
        assert_eq!(e.name, "Firefox");
        assert_eq!(e.icon.as_deref(), Some("firefox"));
        assert_eq!(command(&e.exec, "https://a.example/"), ["/usr/lib/firefox/firefox", "https://a.example/"]);
        assert_eq!(
            command(e.private_exec.as_deref().unwrap(), "https://a.example/"),
            ["/usr/lib/firefox/firefox", "--private-window", "https://a.example/"]
        );
    }

    #[test]
    fn leaves_out_what_isnt_another_browser() {
        let wrapper = "[Desktop Entry]\nName=Browser\nExec=omarchy-launch-browser %U\nNoDisplay=true\nMimeType=x-scheme-handler/https;\n";
        assert!(parse("omarchy-browser", wrapper).is_none());
        assert!(parse(OWN_ID, FIREFOX).is_none());
        let viewer = "[Desktop Entry]\nName=Images\nExec=imv %F\nMimeType=image/png;\n";
        assert!(parse("imv", viewer).is_none());
        let ours = "[Desktop Entry]\nName=Browser\nExec=/home/k/.local/bin/nyx-browser %U\nCategories=WebBrowser;\nMimeType=x-scheme-handler/https;\n";
        assert!(parse("nyx-copy", ours).is_none());
        let webapp = "[Desktop Entry]\nName=ChatGPT\nExec=chatgpt %U\nCategories=Utility;\nMimeType=x-scheme-handler/https;\n";
        assert!(parse("chatgpt", webapp).is_none());
        assert!(parse("nyx-copy", ours).is_none());
    }

    #[test]
    fn places_the_address_once_and_quotes_like_the_spec() {
        assert_eq!(command("chromium --incognito", "https://a.example/"), ["chromium", "--incognito", "https://a.example/"]);
        assert_eq!(command("app %U %u --x", "https://a/"), ["app", "https://a/", "--x"]);
        assert_eq!(command("\"/opt/My Browser/run\" --name %i %u", "https://a/"), ["/opt/My Browser/run", "--name", "https://a/"]);
    }

    #[test]
    fn opens_web_pages_only() {
        for url in ["file:///etc/passwd", "javascript:alert(1)", "about:blank"] {
            assert_eq!(open("firefox", url, false).unwrap_err().code, "invalid", "{url}");
        }
    }
}
