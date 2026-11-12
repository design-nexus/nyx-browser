# Audit before the Zen fork

Written 2026-11-12, at `24e1817`, tagged `chrome-layer-final`.

## What exists

Browser ran an unmodified Zen release (`1.24b`, pinned in `upstream.toml`) as a private copy
in `~/.local/share/nyx-browser/runtime/`, with:

- a privileged chrome layer loaded by Mozilla's autoconfig (`chrome/autoconfig/nyx.cfg`,
  `chrome/nyx/`): horizontal tabs, the sidebar's four modes, the top bar, the sidebar's parts,
  the appearance panel and the toolbar actions;
- a WebExtension (`extension/`): the new tab page, the Assistant panel, menus and shortcuts;
- a native host (`apps/bridge`) for Share, Capture, Assistant, the theme and the weather;
- a launcher (`apps/browser`) that sets the profile and app ID and writes the theme to
  `tokens.css` once a second;
- headless Marionette tests (`tests/`).

Every test passed on Zen 1.24b.

## What broke, and why

On 2026-11-06 at 21:02, Zen's own updater replaced the private copy with 1.24.1b
(`runtime/1.24b/zen/updates/last-update.log`). `defaultPref("app.update.enabled", false)` doesn't
stop updates in current Firefox. `nyx.cfg` loads the full layer only on the release it was tested
on, so from then on it loaded just the theme and the built-in add-ons:

- horizontal tabs were locked off;
- the sidebar modes, top bar, sidebar parts, appearance panel and toolbar actions were gone.

The code itself wasn't shown to be broken; the version check turned it off.

## Kept

- The chrome modules, as the starting point for the fork's own modules.
- The extension, the native host and its protocol, validation and allowlist.
- `tokens.rs` and `appearance.rs`.
- The Marionette harness and its tab tests.
- The icons, `docs/SECURITY.md` and `docs/FEASIBILITY.md`.

## Debt

- The theme is polled every second, in the launcher and in the extension. Theme Engine 2.0 sends
  `ThemeChanged` on D-Bus, and `nyx-theme watch` prints each change.
- Tokens use the 1.x palette names, not the 2.0 semantic tokens.
- The host accepts 256 KiB of page text; Assistant refuses more than 128 KiB.
- Assistant's `model_generate` is being replaced by nyx-ai's `chat`.
- Nyx Passwords' extension is copied once at setup and goes stale.
- No actions manifest for `nyx-actions`.
- Not packaged in nyx-packages.
- Settings' Omarchy "Web browser" row doesn't list Browser.
- No browser mockup in nyx-design.

## Decision

Browser becomes a source fork of Zen (`zen-browser/desktop`), starting at release `1.24.2b`.
Nyx's interface is built into the browser instead of patched in at runtime, and the updater is
compiled out, so a release only changes through this repository. Development builds run
locally; releases are built by GitHub Actions; NyxOS packages the release build.
