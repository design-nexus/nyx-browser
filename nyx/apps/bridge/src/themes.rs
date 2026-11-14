//! `nyx-browser-bridge themes`: the Nyx themes Browser can show, for its Themes page. One JSON
//! object: `current` (Browser's own theme and accent, `follow` for the system's), `system` (what
//! following the system shows now), `themes` (each one's id, name, whether it's light, where it
//! comes from, and the colours to draw it with) and `accents` (the swatches an accent is picked
//! from, as the theme shown has them). Browser writes its choices to `appearance.json`; the
//! running `theme --watch` sees the file change and restyles it.

use nyx_theme_core::{A11y, Registry, Scope, Suite, Theme, resolver};
use serde_json::{Value, json};

use crate::appearance::Choice;
use crate::theme::{SLUG, appearance_file};

pub fn run() -> std::process::ExitCode {
    let suite = nyx_theme_core::suite();
    println!("{}", list(&Registry::load(), &suite, &Choice::read(&appearance_file())));
    std::process::ExitCode::SUCCESS
}

/// A theme's colours for a picture of it: Settings' sample (background, panel, text, accent) and
/// its first swatches.
fn colours(theme: &Theme) -> Value {
    json!({
        "bg": theme.palette.bg,
        "panel": theme.look.panel,
        "card": theme.look.card,
        "text": theme.palette.text,
        "dim": theme.palette.dim_text,
        "accent": theme.palette.accent,
        "swatches": theme.look.swatches.iter().take(5).map(|(_, colour)| colour.clone()).collect::<Vec<_>>(),
    })
}

pub fn list(registry: &Registry, suite: &Suite, choice: &Choice) -> Value {
    let a11y = A11y::default();
    let system = resolver::resolve(registry, suite, Scope::App(SLUG), &a11y).theme;
    let shown = choice
        .theme_id()
        .and_then(|id| resolver::resolve_id(registry, id, None, &a11y))
        .map(|r| r.theme)
        .unwrap_or_else(|| system.clone());
    let themes: Vec<Value> = registry
        .entries()
        .iter()
        .filter_map(|entry| {
            let theme = resolver::resolve_id(registry, &entry.meta.id, None, &a11y)?.theme;
            Some(json!({
                "id": entry.meta.id,
                "name": entry.meta.name,
                "light": theme.palette.light,
                "origin": entry.meta.origin,
                "colours": colours(&theme),
            }))
        })
        .collect();
    json!({
        "current": { "theme": choice.theme_id().unwrap_or("follow"), "accent": choice.accent },
        "system": { "id": system.id, "name": system.name, "light": system.palette.light, "colours": colours(&system) },
        "themes": themes,
        "accents": shown.look.swatches.iter().map(|(name, colour)| json!({ "name": name, "colour": colour })).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_every_theme_with_its_colours() {
        let out = list(&Registry::load(), &Suite::default(), &Choice::default());
        let themes = out["themes"].as_array().unwrap();
        for id in ["nyx-dark", "nyx-light", "catppuccin-mocha"] {
            let theme = themes.iter().find(|t| t["id"] == id).unwrap_or_else(|| panic!("{id} missing"));
            assert!(theme["colours"]["bg"].as_str().is_some_and(|c| c.starts_with('#')), "{theme}");
        }
        assert_eq!(themes.iter().find(|t| t["id"] == "nyx-light").unwrap()["light"], true);
        assert_eq!(out["current"]["theme"], "follow");
    }

    #[test]
    fn says_browsers_own_choice_and_its_accents() {
        let choice = Choice { theme: "nyx-light".into(), accent: "green".into(), density: String::new() };
        let out = list(&Registry::load(), &Suite::default(), &choice);
        assert_eq!(out["current"]["theme"], "nyx-light");
        assert_eq!(out["current"]["accent"], "green");
        assert!(out["accents"].as_array().unwrap().iter().any(|a| a["name"] == "green"), "{}", out["accents"]);
    }
}
