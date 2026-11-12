//! The browser's own theme, accent and density choices, over what the suite says.

use std::path::Path;

use nyx_theme::{Suite, Theme};
use serde::Deserialize;

/// `appearance.json`, written by the Appearance panel. Empty or `follow` keeps the suite's.
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

    /// The theme to show and the density to use. A theme or accent that doesn't exist (a removed
    /// custom theme, a hand-edited file) keeps what the suite has.
    pub fn apply(&self, suite_theme: Theme, suite: &Suite, app: &str) -> (Theme, String) {
        let mut theme = suite_theme;
        if !self.theme.is_empty() && self.theme != "follow" {
            if let Some(chosen) = nyx_theme::all().into_iter().find(|t| t.id == self.theme) {
                theme = chosen;
                let accent = theme.look.accents.get(app).cloned().unwrap_or_else(|| theme.palette.accent.clone());
                set_accent(&mut theme, accent);
            }
        }
        if let Some((_, color)) = theme.look.swatches.iter().find(|(name, _)| *name == self.accent) {
            let color = color.clone();
            set_accent(&mut theme, color);
        }
        let density = if self.density.is_empty() { suite.density.clone() } else { self.density.clone() };
        (theme, density)
    }
}

fn set_accent(theme: &mut Theme, color: String) {
    theme.palette.glow = color.clone();
    theme.palette.accent = color;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn theme(id: &str) -> Theme {
        nyx_theme::all().into_iter().find(|t| t.id == id).expect("a shipped theme")
    }

    #[test]
    fn nothing_chosen_keeps_the_suite() {
        let base = theme("nyx-dark");
        let accent = base.palette.accent.clone();
        let suite = Suite { density: "compact".into(), ..Default::default() };
        let (shown, density) = Choice::default().apply(base, &suite, "browser");
        assert_eq!(shown.id, "nyx-dark");
        assert_eq!(shown.palette.accent, accent);
        assert_eq!(density, "compact");
    }

    #[test]
    fn choices_override_the_suite() {
        let choice = Choice { theme: "nyx-light".into(), accent: "green".into(), density: "relaxed".into() };
        let (shown, density) = choice.apply(theme("nyx-dark"), &Suite::default(), "browser");
        assert_eq!(shown.id, "nyx-light");
        let green = &theme("nyx-light").look.swatches.iter().find(|(n, _)| n == "green").unwrap().1.clone();
        assert_eq!(&shown.palette.accent, green);
        assert_eq!(density, "relaxed");
    }

    #[test]
    fn unknown_names_are_ignored() {
        let choice = Choice { theme: "no-such-theme".into(), accent: "no-such-color".into(), density: String::new() };
        let base = theme("nyx-dark");
        let accent = base.palette.accent.clone();
        let (shown, _) = choice.apply(base, &Suite::default(), "browser");
        assert_eq!(shown.id, "nyx-dark");
        assert_eq!(shown.palette.accent, accent);
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
