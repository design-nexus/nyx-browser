# Horizontal tabs on Zen

Tested on Zen 1.24b (Gecko 159), official Linux x86_64 build, unmodified.

## Result

Horizontal tabs work without patching Zen's source. `tests/tabs.py` passes every test with
horizontal tabs, with vertical tabs in the expanded sidebar, and with vertical tabs in the
icon rail.

| Test | What it does |
| --- | --- |
| `layout` | Tabs lie in one row or column, on screen, clear of the page |
| `drag_reorder` | Drag to the far end and back |
| `drop_side` | The near half of a tab drops before it, the far half after it |
| `pinned` | Pinned tabs come first and reorder by drag |
| `folders` | Create, collapse and reopen a folder |
| `workspaces` | Create, switch, keep tabs apart, remove |
| `split_view` | Split, switch away, come back |
| `overflow` | 30 tabs: selecting brings a tab into view; a wheel scrolls the row, not vertically |
| `essentials` | Add and remove |
| `keyboard_and_lifecycle` | Move to the next tab, open, close, reopen closed |
| `drag_into_folder` | Drop a tab on a tab inside a folder |
| `drag_between_sections` | Drag into and out of the pinned section |
| `compact_mode` | The rows slide away, the page fills the window, hovering brings them back |
| `second_window` | A new window gets the same orientation |
| `switching` | Live switch both ways keeps tabs, order, selection, pin and workspace |
| `session_restore` | Restart keeps tabs, pin, folder, split and orientation |

## How it works

Zen's `zen.tabs.vertical` pref still switches tabbrowser's logic and rebuilds the toolbars.
Three things stay vertical, and the chrome layer handles them:

1. **Layout.** `chrome/nyx/horizontal.css` lays out the toolbox as two rows and turns each
   workspace into a row. CSS has to be loaded by the chrome layer.
2. **Scrollbox orientation.** Each workspace's scrollbox is created vertical.
   `chrome/nyx/orientation.js` sets it and watches for new workspaces.
3. **Input that assumes a column.**
   - `_dropsBefore` compares Y positions, so it's overridden to compare X in a row.
   - `_placeDropIndicator` draws a horizontal line, so the row gets a vertical one.
   - Zen stops wheel events on its scrollboxes because vertical ones scroll natively, so a
     row turns vertical wheel movement into sideways scrolling. Sideways trackpad swipes
     stay Zen's, which switch workspaces.

CSS alone can't do this. The second and third items need privileged JavaScript, loaded by
Mozilla's autoconfig from a private copy of the Zen release. That runs on the official
release build, in the install folder only.

## What this doesn't prove

Tests run in a headless browser with no compositor. **Check these by hand before relying on
them:**

- **A real pointer drag.** Drags are synthesized events through Zen's real handlers, not an
  operating system drag session. Dragging a tab to another window or tearing it off isn't
  tested at all.
- **Wayland and Hyprland.** Nothing has run on a real compositor yet.
- **Drops on a folder's own label.** Zen decides these from the pointer's Y position in a
  private method (`#applyDragoverIndicator`), which can't be overridden. Drops on tabs inside
  a folder are tested and work. On a label, the result may depend on where in the row's
  height the pointer is.
- **Dragging onto Essentials or the page to split.** Essentials and split views are tested
  through Zen's own calls, not by dragging.
- **Private windows, right-to-left layouts and trackpad gestures.**

## Cost

Median of 3 headless starts on Zen 1.24b, after a first start on each new profile:

| | First paint | Session restored |
| --- | --- | --- |
| Zen as released | 669 ms | 752 ms |
| With the chrome layer | 676 ms | 778 ms |

## Upkeep

The override points are Zen internals, and a Zen release can move them. Each upgrade should
raise `upstream.toml` only after `tests/tabs.py` passes against the new release.

Runs have logged `SessionStartup.sys.mjs: initialState.savedGroups is undefined` while session
restore still passes. Its cause hasn't been investigated, and it hasn't been compared against
Zen without the chrome layer.
