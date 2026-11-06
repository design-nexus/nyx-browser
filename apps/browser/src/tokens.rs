//! The suite's theme as CSS custom properties for the browser's chrome and new tab page.

use std::fmt::Write;

use nyx_theme::{Suite, Theme};

/// The stylesheet for `theme` at the suite's density and text size.
pub fn css(theme: &Theme, suite: &Suite) -> String {
    let p = &theme.palette;
    let l = &theme.look;
    let (header, nav, control) = match suite.density.as_str() {
        "compact" => (42, 30, 30),
        "relaxed" => (50, 38, 34),
        _ => (46, 34, 32),
    };
    let on_accent = if p.light { "#ffffff" } else { p.bg.as_str() };
    let mut out = String::from(":root {\n");
    let mut put = |name: &str, value: &str| {
        let _ = writeln!(out, "  --nyx-{name}: {value};");
    };
    put("scheme", if p.light { "light" } else { "dark" });
    put("bg", &p.bg);
    put("panel", &l.panel);
    put("card", &l.card);
    put("raised", &l.raised);
    put("popover", &l.popover);
    put("surface", &p.surface);
    put("text", &p.text);
    put("dim", &p.dim_text);
    put("tertiary", &l.text_tertiary);
    put("border", &p.border);
    put("divider", &l.divider);
    put("accent", &p.accent);
    put("on-accent", on_accent);
    put("danger", &p.danger);
    put("warning", &l.warning);
    put("success", &l.success);
    put("shadow", &p.shadow);
    put("hover", &percent(l.hover));
    put("selection", &percent(l.selection));
    put("radius-small", &format!("{}px", l.shape.radius_small));
    put("radius-card", &format!("{}px", l.shape.radius_card));
    put("radius-dialog", &format!("{}px", l.shape.radius_dialog));
    put("font", &font_stack(l.font.ui.as_deref().unwrap_or("")));
    put("text-scale", &format!("{}", suite.text_scale.clamp(0.9, 1.25)));
    put("header", &format!("{header}px"));
    put("nav", &format!("{nav}px"));
    put("control", &format!("{control}px"));
    for (name, color) in &l.swatches {
        let name: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').collect();
        put(&format!("swatch-{name}"), color);
    }
    out.push_str("}\n");
    out
}

fn percent(strength: f64) -> String {
    format!("{}%", (strength.clamp(0.0, 1.0) * 100.0).round())
}

/// A theme's comma-separated font names as a quoted CSS stack, ending in `sans-serif`. The
/// names come from a file the user can edit, so only characters a font name uses get through.
fn font_stack(names: &str) -> String {
    let mut stack: Vec<String> = names
        .split(',')
        .map(|n| n.chars().filter(|c| c.is_alphanumeric() || " -_.".contains(*c)).collect::<String>())
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty())
        .map(|n| format!("\"{n}\""))
        .collect();
    if stack.is_empty() {
        stack.extend(["\"Inter\"", "\"Inter Variable\"", "\"Inter 18pt\""].map(String::from));
    }
    stack.push("sans-serif".into());
    stack.join(", ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn font_names_cant_break_out_of_the_declaration() {
        let stack = font_stack("Inter, Evil\"; } * { display: none; } .x { a: \"");
        assert!(!stack.contains(';') && !stack.contains('{') && !stack.contains('}'), "{stack}");
        assert!(stack.starts_with("\"Inter\", "), "{stack}");
        assert!(stack.ends_with("sans-serif"), "{stack}");
    }

    #[test]
    fn an_empty_font_falls_back() {
        assert_eq!(font_stack(""), "\"Inter\", \"Inter Variable\", \"Inter 18pt\", sans-serif");
    }

    #[test]
    fn strengths_become_clamped_percentages() {
        assert_eq!(percent(0.16), "16%");
        assert_eq!(percent(3.0), "100%");
        assert_eq!(percent(-1.0), "0%");
    }
}
