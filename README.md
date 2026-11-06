# Browser

A web browser for [Omarchy](https://omarchy.org), built on the
[Zen](https://zen-browser.app) release of Firefox. Tabs run down a sidebar or across the top,
and its colors come from your Nyx theme. It runs a private copy of Zen with its own profile, so
an installed Zen or Firefox and their profiles aren't touched.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/install.sh | bash
```

Add `bash -s -- --default` in place of `bash` to make it your default browser. To remove it, run
the same line with `uninstall.sh` in place of `install.sh`. Your profile stays unless you add
`--purge`.

The installer downloads one Zen release, about 113 MB, and checks it against the SHA-256 in
`upstream.toml`. Building needs Rust.

## What it does

- **Tabs:** vertical or horizontal, switched live without closing anything. Pinned tabs, folders,
  workspaces and split view work in both.
- **Sidebar:** expanded, icon rail, hidden, or automatic, which follows the window's width.
- **Appearance:** follows your Nyx theme and accent as they change, or set a theme, accent and
  density just for Browser. The settings button or <kbd>Ctrl</kbd>+<kbd>,</kbd> opens it.
- **New tab page:** search, your most visited sites and recent pages. No news or sponsored content.
- **Security:** the address bar always shows a page's security state, including a warning on a page
  that isn't secure.
- **Firefox extensions:** installed and signed the usual way.

## With other Nyx apps

Each one needs that app installed, and can be turned off in Settings.

- **Passwords:** logins, passkeys and masked email from Nyx Passwords. Pair it once from its
  toolbar button.
- **Share** (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>): sends a page, selection, image or
  finished download to the Share Sheet.
- **Capture** (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>): opens a visible or full-page
  screenshot in Capture. A region and text from a region are in the page's menu.
- **Assistant** (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>): asks the local Assistant about a page
  in a side panel. It asks before reading each page, and the text stays on this computer.

## Privacy and safety

Pages can't reach these features. The extension adds nothing to pages, and a page's text is only
read after you ask and allow it. Assistant is called with no tools, and page text is marked as
untrusted data, so a page can affect the words of an answer but can't make anything happen. The
native host accepts a fixed list of requests, runs no shell, and answers only this extension when
started by a browser. See [docs/SECURITY.md](docs/SECURITY.md).

## Limits

- Tests run in a headless browser. Real pointer drags, tearing a tab into a new window and running
  on a live compositor need checking by hand: see [docs/FEASIBILITY.md](docs/FEASIBILITY.md).
- It stays on the Zen release pinned in `upstream.toml` until a new one passes the tests, and doesn't
  update itself. On any other release it falls back to vertical tabs. Run
  `tools/bump-upstream.sh VERSION` to move to a new release.
- Automatic sidebar mode is set by the focused window, because the sidebar's settings are shared
  between windows.
- With horizontal tabs, a drop on a folder's own label depends on the pointer's height in the row.

## Development

```sh
cargo test --locked && cargo build --locked && tools/setup-runtime.sh
tests/tabs.py && tests/look.py && tests/integration.py
./install.sh && tests/launcher.py
```
