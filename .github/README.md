# Browser

A web browser for NyxOS and [Omarchy](https://omarchy.org): a source fork of
[Zen](https://zen-browser.app), which is Firefox with workspaces, split view and vertical tabs.
Browser has its own interface in Nyx Design 2.0: tabs down a sidebar or across the top, a sidebar
that adapts to the window, a minimal top bar, and colors from your Nyx theme. It keeps its own
profile, so an installed Zen or Firefox and their profiles aren't touched, and Firefox extensions
work as usual.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/install.sh | bash
```

Add `bash -s -- --default` in place of `bash` to make it your default browser. To remove it, run
the same line with `uninstall.sh` in place of `install.sh`. Your profile stays unless you add
`--purge`. The installer downloads the latest release and checks its SHA-256; building the native
host needs Rust. On NyxOS, Browser comes from nyx-packages.

## What it does

- **Tabs:** vertical or horizontal, switched live without closing anything. Pinned tabs, folders,
  workspaces and split view work in both.
- **Sidebar:** expanded, icon rail, hidden, or automatic, which follows each window's width.
- **Top bar:** back, forward, reload, the address field and your buttons. A narrow window moves the
  last buttons into More tools.
- **Appearance:** follows your Nyx theme and accent as they change (Theme Engine 2.0), or set a
  theme, accent and density just for Browser. The settings button or <kbd>Ctrl</kbd>+<kbd>,</kbd>
  opens it.
- **New tab page:** search, favorites, your most visited sites and recent pages. No news or
  sponsored content.
- **Address bar:** always shows a page's security state, including a warning on a page that isn't
  secure. A star adds a favorite, and the button beside it shows a QR code for the page.
- **Workspaces and folders:** the sidebar has a workspace menu and tab search, a Folders section,
  and workspace icons at its foot. <kbd>Ctrl</kbd>+<kbd>B</kbd> changes the sidebar, and
  <kbd>F1</kbd> lists the shortcuts.
- **Updates** come only through its packaging: there's no in-app updater.

## With other Nyx apps

Each one needs that app installed, and can be turned off in Settings.

- **Passwords:** logins, passkeys and masked email from Nyx Passwords. Pair it once from its
  toolbar button.
- **Share** (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>): sends a page, selection, image or
  finished download to the Share Sheet.
- **Capture** (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>): opens a visible or full-page
  screenshot in Capture. A region and text from a region are in the page's menu.
- **Assistant** (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>): asks Assistant's local model, on
  Nyx AI Core, about a page in a side panel. It asks before reading each page, and the text stays on
  this computer.
- **Nyx actions:** `nyx browser open <address>`, `nyx browser search <words>` and Glimpse can
  open pages in Browser.

## Privacy and safety

Pages can't reach these features. The extension adds nothing to pages, and a page's text is only
read after you ask and allow it. Assistant's model gets no tools, and page text is marked as
untrusted data, so a page can affect the words of an answer but can't make anything happen. The
native host accepts a fixed list of requests, runs no shell, and answers only this extension when
started by a browser. See [nyx/docs/SECURITY.md](../nyx/docs/SECURITY.md).

## Development

See [AGENTS.md](../AGENTS.md) for the build, and [nyx/docs/UPDATING.md](../nyx/docs/UPDATING.md) for
Zen releases and security updates. Browser is MPL-2.0, as Zen and Firefox are; the native host
and its tests in `nyx/` are MIT. Browser isn't made or endorsed by Mozilla or the Zen team.
