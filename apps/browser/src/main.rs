//! Starts the private Zen runtime on its own profile and keeps its theme file current.

mod tokens;

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::Duration;

const APP_ID: &str = "io.github.design_nexus.nyx.Browser";
/// The accent's key in the suite's `[app_accents]`.
const ACCENT_APP: &str = "browser";
const UPSTREAM: &str = include_str!("../../../upstream.toml");

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().is_some_and(|a| a == "--print-tokens") {
        print!("{}", current_tokens());
        return ExitCode::SUCCESS;
    }

    let zen = data_home().join("nyx-browser/runtime").join(pinned_version()).join("zen/zen-bin");
    if !zen.is_file() {
        eprintln!("nyx-browser: {} is missing; run the installer", zen.display());
        return ExitCode::FAILURE;
    }
    let tokens_file = state_home().join("nyx-browser/tokens.css");
    if let Err(error) = write_if_changed(&tokens_file, &current_tokens()) {
        eprintln!("nyx-browser: can't write {}: {error}", tokens_file.display());
    }
    let sync_file = tokens_file.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(1));
            // A failed write leaves the last theme showing; the next second tries again.
            let _ = write_if_changed(&sync_file, &current_tokens());
        }
    });

    let profile = data_home().join("nyx-browser/profile");
    if let Err(error) = std::fs::create_dir_all(&profile) {
        eprintln!("nyx-browser: can't create {}: {error}", profile.display());
        return ExitCode::FAILURE;
    }
    let status = Command::new(&zen)
        .args(["--name", APP_ID, "--class", APP_ID, "--profile"])
        .arg(&profile)
        .args(&args)
        .env("MOZ_ENABLE_WAYLAND", "1")
        .status();
    match status {
        Ok(status) if status.success() => ExitCode::SUCCESS,
        Ok(status) => ExitCode::from(status.code().unwrap_or(1).clamp(1, 255) as u8),
        Err(error) => {
            eprintln!("nyx-browser: can't start {}: {error}", zen.display());
            ExitCode::FAILURE
        }
    }
}

fn current_tokens() -> String {
    let suite = nyx_theme::read_suite().unwrap_or_default();
    tokens::css(&nyx_theme::suite_theme(ACCENT_APP), &suite)
}

fn pinned_version() -> &'static str {
    version_in(UPSTREAM).expect("upstream.toml names a version")
}

fn version_in(upstream: &str) -> Option<&str> {
    upstream.lines().find_map(|l| l.strip_prefix("version = \"")?.strip_suffix('"'))
}

/// Replaces `path` atomically, and only when the text differs, so a poll in the browser sees
/// a new modification time only for a real change.
fn write_if_changed(path: &Path, text: &str) -> std::io::Result<()> {
    if std::fs::read_to_string(path).is_ok_and(|old| old == text) {
        return Ok(());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension(format!("{}.tmp", std::process::id()));
    std::fs::write(&temporary, text)?;
    std::fs::rename(&temporary, path)
}

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

fn data_home() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/share"))
}

fn state_home() -> PathBuf {
    std::env::var_os("XDG_STATE_HOME").map(PathBuf::from).unwrap_or_else(|| home().join(".local/state"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_pinned_version() {
        assert_eq!(version_in("# note\nversion = \"1.24b\"\nurl = \"x\"\n"), Some("1.24b"));
        assert_eq!(version_in("url = \"x\"\n"), None);
        assert!(version_in(UPSTREAM).is_some());
    }

    #[test]
    fn writes_only_a_change() {
        let dir = std::env::temp_dir().join(format!("nyx-browser-write-{}", std::process::id()));
        let file = dir.join("deep/tokens.css");
        write_if_changed(&file, "one").unwrap();
        let first = std::fs::metadata(&file).unwrap().modified().unwrap();
        std::thread::sleep(Duration::from_millis(20));
        write_if_changed(&file, "one").unwrap();
        assert_eq!(std::fs::metadata(&file).unwrap().modified().unwrap(), first);
        write_if_changed(&file, "two").unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "two");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
