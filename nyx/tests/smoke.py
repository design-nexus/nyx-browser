#!/usr/bin/env python3
"""A build is Browser: its own name, profile and theme, no updater, and its chrome loaded.

    tests/smoke.py                          # the build in engine/
    NYX_BROWSER_DIR=/path/to/nyx-browser tests/smoke.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from marionette import Browser  # noqa: E402

TOKENS = ":root {\n  --nyx-bg: #123456;\n  --nyx-scheme: dark;\n}\n"
failures = []


def check(ok, message, detail=None):
    print(("ok  " if ok else "FAIL") + f"  {message}" + ("" if ok or detail is None else f": {detail}"))
    if not ok:
        failures.append(message)


def main():
    system_dir = "/nonexistent/nyx-browser-system"
    with Browser({}, tokens=TOKENS, env={"MOZ_SYSTEM_DIR": system_dir}) as b:
        d = b.js_async(r"""
            const done = arguments[arguments.length - 1];
            (async () => {
              const { AppConstants } = ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs");
              const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
              const brand = Services.strings.createBundle("chrome://branding/locale/brand.properties");
              for (let i = 0; i < 50 && getComputedStyle(document.documentElement).getPropertyValue("--nyx-bg").trim() !== "#123456"; i++) {
                await new Promise(r => setTimeout(r, 100));
              }
              let addon = null;
              for (let i = 0; i < 50 && !addon; i++) {
                addon = await AddonManager.getAddonByID("nyx-integration@design-nexus.github.io");
                if (!addon) await new Promise(r => setTimeout(r, 100));
              }
              done({
                name: Services.appinfo.name,
                vendor: Services.appinfo.vendor,
                brand: brand.GetStringFromName("brandShortName"),
                updater: AppConstants.MOZ_UPDATER,
                profileRoot: Services.dirsvc.get("DefProfRt", Ci.nsIFile).path,
                systemDir: Services.dirsvc.get("XRESysNativeManifests", Ci.nsIFile).path,
                bg: getComputedStyle(document.documentElement).getPropertyValue("--nyx-bg").trim(),
                modules: !!window.NyxSidebar && !!window.NyxAppearance,
                widgets: ["nyx-appearance-button", "nyx-share-button"].every(id => !!document.getElementById(id)),
                addon: addon && { active: addon.isActive, builtin: addon.isBuiltin },
                tabs: gBrowser.tabs.length,
              });
            })().catch(e => done({ error: String(e) }));
        """, timeout=40)
        check("error" not in d, "the checks ran", d.get("error"))
        if "error" in d:
            return
        # The vendor stays Firefox's (browser/moz.configure implies it), as in Zen; it isn't shown.
        check(d["name"] == "Nyx-Browser", "the application is Browser's", d["name"])
        check(d["brand"] == "Browser", "the brand name is Browser", d["brand"])
        check(d["updater"] is False, "there's no in-app updater", d["updater"])
        check(d["profileRoot"] == str(b.home / ".config/nyx-browser"), "profiles live in $XDG_CONFIG_HOME/nyx-browser", d["profileRoot"])
        check(d["systemDir"] == system_dir, "MOZ_SYSTEM_DIR names the native-messaging folder", d["systemDir"])
        check(d["bg"] == "#123456", "the theme bridge's stylesheet is on the window", d["bg"])
        check(d["modules"] and d["widgets"], "Browser's own chrome loaded", d)
        check(bool(d["addon"]) and d["addon"]["active"] and d["addon"]["builtin"], "the Nyx extension is built in and running", d["addon"])
        check(d["tabs"] >= 1, "a tab is open", d["tabs"])


if __name__ == "__main__":
    main()
    print(f"\n{len(failures)} failed" if failures else "\nall passed")
    sys.exit(1 if failures else 0)
