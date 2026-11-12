//! `nyx-browser-bridge theme [--watch]`: Browser's theme as CSS. With `--watch` it runs for as
//! long as the browser does, printing a JSON line `{"css": …}` now and after every change, so the
//! browser never polls. A change arrives as `ThemeChanged` on the session bus, as a file change
//! in a folder the theme depends on, or as a line on stdin when the browser has saved its own
//! choices. The browser closing stdin ends it.

use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use nyx_theme_core::{A11y, Registry, Scope, resolver};
use serde_json::json;

use crate::appearance::Choice;
use crate::tokens;

/// Browser's id in the suite's `[applications]`, where Settings keeps a theme chosen for it.
const SLUG: &str = "nyx-browser";
/// Browser's key in the suite's `[app_accents]` and a theme's `[accents]`.
const ACCENT_APP: &str = "browser";

pub fn run(args: &[String]) -> std::process::ExitCode {
    if args.iter().any(|a| a == "--watch") {
        watch();
    } else {
        print!("{}", css());
    }
    std::process::ExitCode::SUCCESS
}

pub fn css() -> String {
    let suite = nyx_theme_core::suite();
    let a11y = A11y::system();
    let registry = Registry::load();
    let choice = Choice::read(&appearance_file());
    let resolved = choice
        .theme_id()
        .and_then(|id| resolver::resolve_id(&registry, id, Some(&suite.tokens), &a11y))
        .unwrap_or_else(|| resolver::resolve(&registry, &suite, Scope::App(SLUG), &a11y));
    let mut theme = resolved.theme;
    let density = choice.apply(&mut theme, &suite, ACCENT_APP);
    tokens::css(&theme, &resolved.tokens, &suite, &density)
}

fn watch() {
    let (changed, changes) = mpsc::channel::<()>();

    let bus = changed.clone();
    std::thread::spawn(move || {
        // Without a session bus the file watch below still sees every change.
        let _ = nyx_theme_core::dbus::watch(|_| bus.send(()).is_ok());
    });

    let files = changed.clone();
    let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if event.is_ok_and(|e| !matches!(e.kind, notify::EventKind::Access(_))) {
            let _ = files.send(());
        }
    });
    let _watcher = watcher.ok().map(|mut watcher| {
        let mut dirs = nyx_theme_core::paths::watched_dirs();
        if let Some(dir) = appearance_file().parent() {
            dirs.push(dir.to_path_buf());
        }
        for dir in dirs.iter().filter(|d| d.is_dir()) {
            let _ = watcher.watch(dir, RecursiveMode::NonRecursive);
        }
        watcher
    });

    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            if line.is_err() || changed.send(()).is_err() {
                break;
            }
        }
        std::process::exit(0);
    });

    let mut shown = String::new();
    show(&mut shown);
    while changes.recv().is_ok() {
        // Switching themes rewrites several files at once; the burst is answered once.
        std::thread::sleep(Duration::from_millis(80));
        while changes.try_recv().is_ok() {}
        show(&mut shown);
    }
}

fn show(shown: &mut String) {
    let css = css();
    if css == *shown {
        return;
    }
    let mut out = std::io::stdout().lock();
    if writeln!(out, "{}", json!({ "css": css })).and_then(|()| out.flush()).is_err() {
        std::process::exit(0);
    }
    *shown = css;
}

pub fn appearance_file() -> PathBuf {
    config_home().join("nyx-browser/appearance.json")
}

fn config_home() -> PathBuf {
    std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/")).join(".config"))
}
