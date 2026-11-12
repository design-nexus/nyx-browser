//! The browser's own theme, accent and density choices, over what the suite says.

use std::path::Path;

use nyx_theme_core::{Suite, Theme};
use serde::Deserialize;

/// `appearance.json`, written by Browser's settings. Empty or `follow` keeps the suite's.
#[derive(Debug, Default, Deserialize, PartialEq)]
#[serde(default)]
pub struct Choice {
    pub theme: String,
    pub accent: String,
    pub density: String,
}

impl Choice {
    /// A missing or unreadable file means no choices were made.
    pub fn read(path: &Path) -> Self {
        std::fs::read_to_string(path).ok().and_then(|text| serde_json::from_str(&text).ok()).unwrap_or_default()
    }

    /// The theme id chosen for Browser alone, if any.
    pub fn theme_id(&self) -> Option<&str> {
        (!self.theme.is_empty() && self.theme != "follow").then_some(self.theme.as_str())
    }

    /// The accent and density to show. An accent that doesn't exist (a hand-edited file) keeps
    /// the one the suite picked for Browser, then the theme's own for it.
    pub fn apply(&self, theme: &mut Theme, suite: &Suite, app: &str) -> String {
        let swatch = |name: &str| theme.look.swatches.iter().find(|(n, _)| n == name).map(|(_, c)| c.clone());
        let accent = swatch(&self.accent)
            .or_else(|| suite.app_accents.get(app).and_then(|name| swatch(name)))
            .or_else(|| theme.look.accents.get(app).cloned())
            .unwrap_or_else(|| theme.palette.accent.clone());
        theme.palette.glow = accent.clone();
        theme.palette.accent = accent;
        if self.density.is_empty() { suite.density.clone() } else { self.density.clone() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn theme(id: &str) -> Theme {
        nyx_theme_core::all().into_iter().find(|t| t.id == id).expect("a shipped theme")
    }

    #[test]
    fn nothing_chosen_keeps_the_suite() {
        let mut shown = theme("nyx-dark");
        let accent = shown.palette.accent.clone();
        let suite = Suite { density: "compact".into(), ..Default::default() };
        let density = Choice::default().apply(&mut shown, &suite, "browser");
        assert_eq!(shown.palette.accent, accent);
        assert_eq!(density, "compact");
        assert_eq!(Choice::default().theme_id(), None);
    }

    #[test]
    fn choices_override_the_suite() {
        let choice = Choice { theme: "nyx-light".into(), accent: "green".into(), density: "relaxed".into() };
        let mut shown = theme("nyx-light");
        let density = choice.apply(&mut shown, &Suite::default(), "browser");
        let green = theme("nyx-light").look.swatches.iter().find(|(n, _)| n == "green").unwrap().1.clone();
        assert_eq!(shown.palette.accent, green);
        assert_eq!(density, "relaxed");
        assert_eq!(choice.theme_id(), Some("nyx-light"));
    }

    #[test]
    fn the_suites_accent_for_browser_applies() {
        let mut shown = theme("nyx-dark");
        let mut suite = Suite::default();
        suite.app_accents.insert("browser".into(), "teal".into());
        Choice::default().apply(&mut shown, &suite, "browser");
        let teal = theme("nyx-dark").look.swatches.iter().find(|(n, _)| n == "teal").unwrap().1.clone();
        assert_eq!(shown.palette.accent, teal);
    }

    #[test]
    fn unknown_names_are_ignored() {
        let choice = Choice { theme: "follow".into(), accent: "no-such-color".into(), density: String::new() };
        let mut shown = theme("nyx-dark");
        let accent = shown.palette.accent.clone();
        choice.apply(&mut shown, &Suite::default(), "browser");
        assert_eq!(shown.palette.accent, accent);
        assert_eq!(choice.theme_id(), None);
    }

    #[test]
    fn a_bad_file_reads_as_no_choices() {
        let dir = std::env::temp_dir().join(format!("nyx-browser-appearance-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("appearance.json");
        assert_eq!(Choice::read(&file), Choice::default());
        std::fs::write(&file, "not json").unwrap();
        assert_eq!(Choice::read(&file), Choice::default());
        std::fs::write(&file, r#"{"accent":"teal","extra":1}"#).unwrap();
        assert_eq!(Choice::read(&file).accent, "teal");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
