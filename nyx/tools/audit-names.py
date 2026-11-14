#!/usr/bin/env python3
"""Finds Firefox, Mozilla and Zen in the words Browser shows.

    nyx/tools/audit-names.py [--all]

Reads the built en-US strings (Fluent, .properties, .dtd) under engine/obj-*/dist/bin and lists
each message whose text names Firefox, Mozilla or Zen, leaving out comments, IDs and the strings
in ALLOWED: those of pages and tools Browser doesn't show, each with the reason. --all lists those
too. Exits 1 when anything is left to fix.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NAMES = re.compile(r"\b(Firefox|Mozilla|Zen)\b|\bmozilla\.org\b")

# Files Browser never shows, by their path under the build's en-US folders: the reason is beside each.
ALLOWED_FILES = {
    "devtools/": "the developer tools keep Firefox's words; they're for web developers",
    "toolkit/about/aboutTelemetry.ftl": "about:telemetry, a diagnostic page; telemetry is off",
    "toolkit/about/aboutMozilla.ftl": "about:mozilla, an easter egg nothing links to",
    "toolkit/about/aboutSupport.ftl": "about:support, troubleshooting data that names what it reports",
    "toolkit/about/aboutProcesses.ftl": "about:processes, a diagnostic page",
    "toolkit/about/aboutGlean.ftl": "about:glean, a diagnostic page; telemetry is off",
    "toolkit/about/aboutWebrtc.ftl": "about:webrtc, a diagnostic page",
    "toolkit/about/aboutProfiles.ftl": "about:profiles, a diagnostic page",
    "toolkit/global/processTypes.ftl": "process names, shown only on diagnostic pages",
    "browser/policies/": "enterprise policy descriptions, on about:policies only",
    "browser/newtab/": "Firefox's new tab and onboarding, replaced by Browser's start page",
    "browser/preferences/zen-preferences.ftl": "Zen's settings panes, which Browser's Settings don't show",
    "browser/preferences/preferences.ftl": "Firefox's settings panes, which Browser's Settings don't show",
    "browser/preferences/moreFromMozilla.ftl": "Firefox's More from Mozilla pane, not shown",
    "browser/profile/default-bookmarks.ftl": "default bookmarks, no longer made (default-bookmarks.html)",
    "browser/installer/": "the Windows installer, which Browser doesn't build",
    "global/mozilla.dtd": "the easter egg's page",
    "pipnss/pipnss.properties": "certificate internals: the built-in token's maker",
    "dom/dom.properties": "web console warnings for developers",
    "global/layout_errors.properties": "web console warnings for developers",
    "browser/zen-library.ftl": "Zen's Library, which is off",
}


def message_texts(path):
    """Each message's text with its ID, comments left out."""
    suffix = path.suffix
    current = None
    for line in path.read_text(errors="ignore").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("<!--"):
            continue
        if suffix == ".ftl":
            match = re.match(r"^(-?[A-Za-z][\w-]*)\s*=\s*(.*)$", line)
            if match:
                current = match.group(1)
                yield current, match.group(2)
            elif line[:1].isspace() and current:
                yield current, re.sub(r"^\s*\.[\w-]+\s*=\s*", "", line)
        elif suffix == ".properties":
            key, _, value = line.partition("=")
            yield key.strip(), value
        elif suffix == ".dtd":
            match = re.match(r'<!ENTITY\s+(\S+)\s+"(.*)">', stripped)
            if match:
                yield match.group(1), match.group(2)


def main():
    show_all = "--all" in sys.argv
    builds = sorted(ROOT.glob("engine/obj-*/dist/bin"))
    if not builds:
        sys.exit("No build under engine/obj-*/dist/bin")
    files = [p for p in builds[0].rglob("*") if p.suffix in {".ftl", ".properties", ".dtd"} and "en-US" in p.parts]
    left, allowed = [], []
    for path in sorted(files):
        relative = path.as_posix().split("en-US/", 1)[-1]
        reason = next((why for prefix, why in ALLOWED_FILES.items() if prefix in relative), None)
        for key, text in message_texts(path):
            if NAMES.search(text) and "http" not in text.split(NAMES.search(text).group(0))[0][-12:]:
                (allowed if reason else left).append((relative, key, text.strip(), reason))
    for relative, key, text, _ in left:
        print(f"{relative}: {key} = {text[:120]}")
    if show_all:
        print(f"\nAllowed ({len(allowed)}):")
        for relative, key, text, reason in allowed:
            print(f"  {relative}: {key}  [{reason}]")
    print(f"\n{len(left)} to fix, {len(allowed)} allowed", file=sys.stderr)
    sys.exit(1 if left else 0)


if __name__ == "__main__":
    main()
