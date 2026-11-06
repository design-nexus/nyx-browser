# Browser

A Zen release (pinned in `upstream.toml`, unmodified) plus a chrome layer, extension and
native host. No Zen source fork. Source patches are a last resort.

Commands: `tools/setup-runtime.sh`; `tests/tabs.py`

- `chrome/autoconfig/` runs at startup from the private runtime; `chrome/nyx/` is the layer
  it loads into each window.
- `tests/tabs.py` runs headless with its own HOME. Run it after any change to the chrome layer,
  and before raising `upstream.toml`.
- Never modify the system's Zen, a user's profile or the default browser, except through
  `--default`.
- Colors come from `nyx_theme`. Security and permission indicators are never hidden.

Use canonical STYLE.md from the pinned nyx-design dependency. Reuse existing
widgets, theme tokens, icons, and shortcuts.
Common guidance: https://github.com/design-nexus/nyx/blob/main/docs/AGENTS_COMMON.md
