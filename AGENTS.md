# Browser

A source fork of Zen Browser (`zen-browser/desktop`), itself Firefox with patches. Nyx owns the
interface; Mozilla and Zen remain the source for the engine and security fixes. See
`nyx/docs/UPDATING.md` for how Zen's releases come in and where Nyx's changes live.

- Nyx's code: `src/nyx/` (chrome modules, styles, icons, the extension), `nyx/` (native host,
  tests, install, Nyx's engine patches in `nyx/patches/`, docs), `prefs/nyx/`, `configs/branding/nyx/`,
  `mozconfig`. Edits in Zen's own files are small and carry a `Nyx:` comment.
- Structure is code: orientation, sidebar modes, toolbar layout and overflow live in JavaScript
  (Zen's managers or `src/nyx/modules`). CSS is for appearance and layout styling.
- `engine/` is generated (Firefox's source plus every patch): never edit it except to write a
  patch with `nyx/tools/make-patch.sh`.
- Never modify the system's Zen or Firefox, a user's profile or the default browser, except through
  the installer's `--default`. Security and permission indicators are never hidden.
- Colors come from Theme Engine 2.0 through `nyx-browser-bridge theme`.

Commands (`PATH` needs a Python 3.11 first, as `~/.cache/nyx-browser-fork/bin` has):

```sh
npm ci && npx surfer download && nyx/tools/import.sh   # engine/: Firefox, Zen's patches, Nyx's
(cd engine && ./mach --no-interactive bootstrap --application-choice browser --no-system-changes)
npx surfer build              # first build: hours; afterwards `npx surfer build --ui` for chrome-only changes
(cd nyx && cargo test --locked && cargo build --locked)
nyx/tests/smoke.py && nyx/tests/tabs.py && nyx/tests/look.py && nyx/tests/integration.py
./install.sh                  # packages the build and installs it for this user
```

The tests run headless with their own HOME. Run them after any change to `src/nyx/` or to Zen's
files, and before merging a Zen release.

Use canonical STYLE.md from nyx-design. Reuse existing widgets, theme tokens, icons, and shortcuts.
Common guidance: https://github.com/design-nexus/nyx/blob/main/docs/AGENTS_COMMON.md
