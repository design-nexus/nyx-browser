#!/usr/bin/env python3
"""Draws Browser's icons from Umbra's symbolic glyphs (design-nexus/umbra-icons).

    nyx/tools/umbra-icons.py [--umbra DIR]

Writes the icons Umbra has a glyph for, in their own files' formats: Browser's own
(src/nyx/icons) and the ones it puts in place of Zen's (src/browser/themes/shared/zen-icons/nyx).
Icons Umbra doesn't draw keep Browser's drawings, and are listed. The output is committed; the build
doesn't read Umbra. DIR is an umbra-icons checkout, ../umbra-icons beside this one by default.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NYX = ROOT / "src/nyx/icons"
ZEN = ROOT / "src/browser/themes/shared/zen-icons/nyx"

# src/nyx/icons: file name -> Umbra glyph. A glyph in FILLED_FILES is drawn filled as well.
NYX_GLYPHS = {
    "arrow-right": "arrow-right", "back": "arrow-left", "forward": "arrow-right", "chevron": "pan-down",
    "bookmark": "bookmark", "browser": "app", "check": "check", "close": "close", "plus": "plus",
    "cloud": "cloud", "code": "code", "computer": "computer", "copy": "copy", "download": "download",
    "eye": "reveal", "folder": "folder", "folder-open": "folder-open", "font": "font", "globe": "globe",
    "grid": "grid", "grip": "drag", "history": "recent", "home": "home", "image": "image", "key": "key",
    "link": "link", "lock": "lock", "mail": "mail", "menu": "hamburger", "message": "chat", "moon": "moon",
    "more": "more-h", "music": "music", "note": "edit", "phone": "phone", "picker": "eyedropper",
    "pin": "pin", "private": "private", "puzzle": "puzzle", "reload": "refresh", "search": "search",
    "settings": "sliders", "share": "share", "shield": "shield", "sidebar": "sidebar", "sound": "vol-high",
    "sound-mute": "vol-mute",
    "star": "star", "star-filled": "star", "undo": "undo", "warning": "warning",
    "palette": "palette", "layout": "dashboard", "location": "location", "sync": "sync",
    "reader": "list", "file": "documents-page", "pause": "pause", "play": "play",
    "popup": "win-new", "capture": "screenshots", "select": "select-all",
}
# zen-icons/nyx: Zen's icon name -> Umbra glyph. "bookmark" is a page that's bookmarked: a filled star.
ZEN_GLYPHS = {
    "back": "arrow-left", "forward": "arrow-right", "reload": "refresh", "close": "close", "plus": "plus",
    "menu": "hamburger", "sidebar": "sidebar", "downloads": "download", "extension": "puzzle",
    "folder": "folder", "chevron": "pan-down", "bookmark": "star", "bookmark-hollow": "star",
    "search-glass": "search", "security": "lock", "security-broken": "warning",
    # The rest of Zen's icons, each as the Umbra glyph nearest to it.
    "algorithm": "sort-asc", "arrow-corner-down-right": "arrow-right", "arrow-down": "arrow-down",
    "arrow-left": "arrow-left", "arrow-right": "arrow-right", "arrow-up": "arrow-up",
    "arrow-rotate-anticlockwise": "rotate-left", "arrows-collapse": "pan-up", "arrows-expand": "pan-down",
    "autoplay-media": "play", "autoplay-media-blocked": "stop", "autoplay-media-fill": "play",
    "block": "stop", "blocked-element": "eye-off", "bolt": "power-profile", "bookmark-star-on-tray": "star-new",
    "boost": "brush", "brackets-curly": "code", "camera": "webcam", "camera-blocked": "camera-off",
    "camera-fill": "webcam", "canvas": "image", "canvas-blocked": "image", "check": "check",
    "circle-bars-filter": "filter", "close-filled-round": "close", "container-tab": "work",
    "cookies-fill": "database", "customize": "brush", "dart-down": "pan-down",
    "desktop-notification": "bell", "desktop-notification-blocked": "bell-off", "desktop-notification-fill": "bell",
    "developer": "terminal", "dice": "shuffle", "drag-indicator": "drag", "duplicate-tab": "copy",
    "edit-copy": "copy", "edit-cut": "cut", "edit-delete": "trash", "edit-paste": "paste", "edit-theme": "palette",
    "essential-add": "star-new", "essential-remove": "star-empty", "expand-sidebar": "sidebar",
    "extension-blocked": "puzzle", "extension-fill": "puzzle", "eyedropper": "eyedropper", "face-sun": "sun",
    "forget": "trash", "fullscreen": "fullscreen", "fullscreen-exit": "win-restore",
    "geo": "location", "geo-blocked": "location-off", "geo-fill": "location", "hammer": "accessories",
    "heart-circle-fill": "heart", "help": "help", "history": "recent", "home": "home", "info": "info",
    "library": "books", "lightbulb": "night-light", "link": "link", "mail": "mail", "manage": "sliders",
    "media-mute": "vol-mute", "media-next": "skip-fwd", "media-pause": "pause", "media-play": "play",
    "media-previous": "skip-back", "media-unmute": "vol-high", "microphone": "mic", "microphone-blocked": "mic-off",
    "microphone-blocked-fill": "mic-off", "microphone-fill": "mic", "midi": "keyboard", "moon-stars": "moon",
    "move-cursor": "drag", "new-tab-image": "image", "open": "doc-open", "page-portrait": "page",
    "paintbrush": "brush", "paintbrush-fill": "brush", "palette": "palette", "passwords": "key",
    "permissions": "sliders", "permissions-fill": "sliders", "persistent-storage": "drive",
    "persistent-storage-blocked": "drive", "persistent-storage-fill": "drive", "pin": "pin",
    "popup": "win-new", "popup-fill": "win-new", "print": "print", "private-window": "private",
    "private-window-small": "private", "privateBrowsing": "private", "reader-mode": "list", "save": "save", "screen": "display",
    "screen-blocked": "display", "screenshot": "screenshots", "search-page": "search",
    "security-broken-fill": "warning", "security-fill": "lock", "security-warning": "warning",
    "send-to-device": "send", "settings": "sliders", "settings-fill": "sliders", "share": "share",
    "sidebar-right": "sidebar-right", "sidebars-right": "sidebar-right", "signature": "edit",
    "sliders": "sliders", "sparkles": "brightness", "spell-check": "text", "square-wand-sparkle": "brush",
    "tab": "tab-new", "tab-audio-blocked-small": "vol-mute", "tab-audio-muted-small": "vol-mute",
    "tab-audio-playing-small": "vol-high", "text-lowercase": "font", "text-size": "font",
    "text-title-case": "font", "text-uppercase": "font", "tool-profiler": "dashboard",
    "tracking-protection": "shield", "tracking-protection-fill": "shield", "translations": "globe",
    "trash": "trash", "unpin": "pin", "u-turn-to-left": "undo", "video-blocked-fill": "camera-off",
    "video-fill": "webcam", "wand-sparkle": "brush", "window": "app", "xr": "gamepad", "xr-blocked": "gamepad",
    "xr-fill": "gamepad", "zoom-out": "zoom-out",
}
FILLED_FILES = {"star-filled", "bookmark"}

NYX_HEADER = """<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->
"""
ZEN_HEADER = """#filter dumbComments emptyLines substitution
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
STROKE = 'stroke="context-fill" stroke-opacity="context-fill-opacity" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"'


def nyx_svg(d, filled):
    fill = 'fill="context-fill" fill-opacity="context-fill-opacity"' if filled else 'fill="none"'
    return f'{NYX_HEADER}<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" {fill} {STROKE}><path d="{d}"/></svg>\n'


def zen_svg(d, filled):
    fill = 'fill="context-fill"' if filled else 'fill="none"'
    return f'{ZEN_HEADER}<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" {fill} {STROKE}><path d="{d}"/></svg>\n'


def redraw(folder, glyphs, draw, path):
    drawn, kept = 0, []
    names = sorted({svg.stem for svg in folder.glob("*.svg")} | set(glyphs))
    for name in names:
        glyph = glyphs.get(name)
        if not glyph:
            kept.append(name)
            continue
        (folder / f"{name}.svg").write_text(draw(path(glyph), name in FILLED_FILES))
        drawn += 1
    return drawn, kept


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--umbra", type=Path, default=ROOT.parent / "umbra-icons")
    opts = ap.parse_args()
    if not (opts.umbra / "umbra/symbolic_src.py").exists():
        sys.exit(f"No umbra-icons checkout at {opts.umbra}")
    sys.path.insert(0, str(opts.umbra))
    from umbra.symbolic_src import path  # noqa: PLC0415 - Umbra is only there when this runs

    for name, folder, glyphs, draw in (("src/nyx/icons", NYX, NYX_GLYPHS, nyx_svg), ("zen-icons/nyx", ZEN, ZEN_GLYPHS, zen_svg)):
        drawn, kept = redraw(folder, glyphs, draw, path)
        print(f"{name}: {drawn} from Umbra; Browser's own: {', '.join(kept) or 'none'}")


if __name__ == "__main__":
    main()
