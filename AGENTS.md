# Browser

A source fork of Zen Browser (`zen-browser/desktop`), itself Firefox with patches. Nyx owns the
interface; Mozilla and Zen remain the source for the engine and security fixes. See
`nyx/docs/UPDATING.md` for how Zen's releases come in and where Nyx's changes live.

- Nyx's code: `src/nyx/` (chrome modules, styles, icons, the extension), `nyx/` (native host,
  tests, install, Nyx's engine patches in `nyx/patches/`, docs), `prefs/nyx/`, `configs/branding/nyx/`,
  `mozconfig`. Edits in Zen's own files are small and carry a `Nyx:` comment.
- Structure is code: the layouts (Studio, Focus, Workbench in `nyx.layout`, `src/nyx/modules/layout.js`,
  which sets Zen's orientation and single toolbar), sidebar modes, toolbar layout and overflow live
  in JavaScript (Zen's managers or `src/nyx/modules`). CSS is for appearance and layout styling.
- Icons come from Umbra's symbolic glyphs: `nyx/tools/umbra-icons.py` draws `src/nyx/icons` and
  `zen-icons/nyx` (every icon on Linux) from an umbra-icons checkout; a new name in its tables is a
  new file. Icons Umbra doesn't draw keep Browser's own.
- Settings shows only Browser's panes (`src/nyx/preferences/`); Firefox's and Zen's pane names lead
  to them (`nyxPaneFor`). The Library and Extensions are Browser's pages, `about:library` and
  `about:extensions` (`src/nyx/library/`, registered by `NyxAbout.sys.mjs`); Firefox's ways into its
  Library window and add-ons manager open them.
- No Firefox, Mozilla or Zen names in what Browser shows: `nyx/tools/audit-names.py` lists any in
  the built strings, with the few left on purpose and why.
- A new file under `src/` needs its link in `engine/` (as `nyx/tools/import.sh` makes them) and
  `./mach build-backend` before `build faster` packages it.
- `engine/` is generated (Firefox's source plus every patch): never edit it except to write a
  patch with `nyx/tools/make-patch.sh`.
- Never modify the system's Zen or Firefox, a user's profile or the default browser, except through
  the installer's `--default`. Security and permission indicators are never hidden.
- Colors come from Theme Engine 2.0 through `nyx-browser-bridge theme`.
- Nyx Passwords is built in (`NyxPasswords.sys.mjs`, `actors/NyxPasswordsChild.sys.mjs`): Browser
  starts Passwords' own host and loads Passwords' pages from its install; the extension isn't used.
- uBlock Origin is built in under Browser's shield: `nyx/tools/vendor-ublock.sh` (run by
  `import.sh`) puts the pinned release and `nyx/ublock/nyx-shield.patch` into `engine/nyx/ublock/`.
  A profile's own copy from addons.mozilla.org gives way to it, keeping its settings (`NyxAddons`).
- A `--ui` build keeps the last full build's ID, so a profile would keep running the scripts it
  cached: `install.sh` marks each profile to drop its startup cache (`nyx/tools/purge-caches.sh`).
  Check changes on a profile from the previous install too, not only a fresh one
  (`features.py`'s upgrade test).

Commands (`PATH` needs a Python 3.11 first, as `~/.cache/nyx-browser-fork/bin` has). Run surfer as
`./node_modules/.bin/surfer` from the checkout: `npx surfer` anywhere else fetches an unrelated npm
package of that name and runs it.

```sh
npm ci && ./node_modules/.bin/surfer download && nyx/tools/import.sh   # engine/: Firefox, Zen's patches, Nyx's
(cd engine && ./mach --no-interactive bootstrap --application-choice browser --no-system-changes)
./node_modules/.bin/surfer build   # first build: hours; afterwards `surfer build --ui` for chrome-only changes
(cd nyx && cargo test --locked && cargo build --locked)
nyx/tests/smoke.py && nyx/tests/tabs.py && nyx/tests/look.py && nyx/tests/integration.py
nyx/tests/parity.py && nyx/tests/passwords.py && nyx/tests/features.py
./install.sh                  # packages the build and installs it for this user
```

The tests run headless with their own HOME. Run them after any change to `src/nyx/` or to Zen's
files, and before merging a Zen release.

Use canonical STYLE.md from nyx-design. Reuse existing widgets, theme tokens, icons, and shortcuts.
Common guidance: https://github.com/design-nexus/nyx/blob/main/docs/AGENTS_COMMON.md
