#!/usr/bin/env python3
"""The theme and the sidebar's modes, against a private headless browser.

    cargo build && tools/setup-runtime.sh && tests/look.py [--shots DIR]

Theme files come from the launcher's own --print-tokens.
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from marionette import Browser  # noqa: E402


def tokens(theme, density="comfortable", accent=None):
    """The launcher's output for a suite set to `theme`."""
    with tempfile.TemporaryDirectory(prefix="nyx-browser-tokens-") as config:
        (Path(config) / "nyx").mkdir()
        suite = f'mode = "theme"\ntheme = "{theme}"\ndensity = "{density}"\n'
        if accent:
            suite += f'[app_accents]\nbrowser = "{accent}"\n'
        (Path(config) / "nyx/theme.toml").write_text(suite)
        env = {**os.environ, "XDG_CONFIG_HOME": config}
        return subprocess.check_output([str(ROOT / "target/debug/nyx-browser"), "--print-tokens"], env=env, text=True)


def value(css, name):
    return next(line.split(":", 1)[1].strip(" ;") for line in css.splitlines() if line.strip().startswith(f"--nyx-{name}:"))


def check(condition, message, detail=None):
    if not condition:
        raise AssertionError(message + (f": {json.dumps(detail)}" if detail is not None else ""))


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return f"rgb({int(h[0:2], 16)}, {int(h[2:4], 16)}, {int(h[4:6], 16)})"


READ = r"""
const root = getComputedStyle(document.documentElement);
const paint = e => getComputedStyle(e).backgroundColor;
return {
  bg: root.getPropertyValue("--nyx-bg").trim(),
  accent: root.getPropertyValue("--nyx-accent").trim(),
  header: root.getPropertyValue("--nyx-header").trim(),
  layer: getComputedStyle(document.getElementById("zen-browser-background"), "::after").backgroundColor,
  scheme: Services.prefs.getIntPref("zen.view.window.scheme"),
};
"""


def wait_for(b, script, want, timeout=6):
    deadline = time.time() + timeout
    got = None
    while time.time() < deadline:
        got = b.js(script)
        if got == want:
            return got
        time.sleep(0.2)
    raise AssertionError(f"wanted {want!r}, still {got!r}")


def theme_files(shots):
    mocha, light = tokens("catppuccin-mocha"), tokens("nyx-light", density="compact", accent="green")
    with Browser({}, tokens=mocha, width=1600, height=1000) as b:
        d = b.js(READ)
        check(d["bg"] == value(mocha, "bg"), "the theme file didn't load", d)
        check(d["layer"] == rgb(value(mocha, "bg")), "Zen's background layer doesn't follow the theme", d)
        check(d["scheme"] == 0, "a dark theme didn't set a dark window", d)

        started = time.time()
        b.write_tokens(light)
        wait_for(b, "return getComputedStyle(document.documentElement).getPropertyValue('--nyx-bg').trim()", value(light, "bg"))
        took = time.time() - started
        check(took < 3, "the theme took too long to change", took)
        d = b.js(READ)
        check(d["accent"] == value(light, "accent"), "the app accent didn't change", d)
        check(d["header"] == "42px", "the density didn't change", d)
        check(d["scheme"] == 1, "a light theme didn't set a light window", d)
        check(d["layer"] == rgb(value(light, "bg")), "the background layer didn't change", d)
        if shots:
            b.screenshot(Path(shots) / "theme-light.png")

        # Going back proves the swap isn't only working because the newest sheet wins.
        b.write_tokens(mocha)
        wait_for(b, "return getComputedStyle(document.documentElement).getPropertyValue('--nyx-bg').trim()", value(mocha, "bg"))


def security_indicator(shots):
    with Browser({}, tokens=tokens("catppuccin-mocha"), width=1600, height=1000) as b:
        # On a real page, in both orientations. A new tab page has no site to report on.
        for vertical in (True, False):
            b.js(f"Services.prefs.setBoolPref('zen.tabs.vertical', {str(vertical).lower()})")
            d = b.js_async(r"""
                const done = arguments[arguments.length - 1];
                const tab = gBrowser.addTab("data:text/html,<title>Plain</title>page", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
                gBrowser.selectedTab = tab;
                setTimeout(() => {
                  const box = document.getElementById("identity-box");
                  const icon = document.getElementById("identity-icon");
                  const r = icon.getBoundingClientRect();
                  const s = getComputedStyle(icon);
                  done({ w: r.width, h: r.height, x: r.x, visible: s.visibility, opacity: s.opacity, display: getComputedStyle(box).display, state: box.className, win: innerWidth });
                }, 1200);
            """)
            check(d["w"] >= 12 and d["h"] >= 12 and d["visible"] == "visible" and float(d["opacity"]) > 0.4 and d["display"] != "none", "the security indicator is hidden", d)
            check(0 <= d["x"] < d["win"], "the security indicator is off screen", d)
            check("notSecure" in d["state"], "the page's security state isn't reported", d)


MODE = r"""
const toolbox = gNavToolbox.getBoundingClientRect();
const page = document.getElementById("tabbrowser-tabbox").getBoundingClientRect();
return {
  attr: document.documentElement.getAttribute("nyx-sidebar"),
  compact: gZenCompactModeManager.preference,
  expanded: Services.prefs.getBoolPref("zen.view.sidebar-expanded"),
  toolbox: [Math.round(toolbox.x), Math.round(toolbox.width)],
  page: [Math.round(page.x), Math.round(page.width)],
  win: innerWidth,
};
"""


def sidebar_modes(shots):
    with Browser({}, tokens=tokens("catppuccin-mocha"), width=1800, height=1100) as b:
        def size(width):
            b.js(f"window.resizeTo({width}, 900)")
            time.sleep(1.4)

        def state():
            return b.js(MODE)

        for width, want in ((1500, "expanded"), (1100, "compact"), (800, "hidden"), (1500, "expanded")):
            size(width)
            d = state()
            check(d["win"] == width, "the window didn't resize", d)
            check(d["attr"] == want, f"automatic chose wrong at {width}", d)
            check(d["compact"] == (want == "hidden"), f"hidden and compact mode disagree at {width}", d)
            if want == "expanded":
                check(d["toolbox"][1] > 150 and d["page"][0] >= d["toolbox"][1] - 8, "the expanded sidebar isn't beside the page", d)
            elif want == "compact":
                check(d["toolbox"][1] < 80, "the rail isn't narrow", d)
            else:
                check(d["page"][1] >= d["win"] - 20, "hidden doesn't give the page the window", d)
            if shots:
                b.screenshot(Path(shots) / f"sidebar-auto-{width}-{want}.png")

        for chosen, width in (("compact", 1500), ("expanded", 800), ("hidden", 1500)):
            b.js(f"Services.prefs.setStringPref('nyx.sidebar.mode', '{chosen}')")
            size(width)
            d = state()
            check(d["attr"] == chosen, f"choosing {chosen} didn't override width {width}", d)
        b.js("Services.prefs.setStringPref('nyx.sidebar.mode', 'auto')")
        size(1100)
        check(state()["attr"] == "compact", "returning to automatic didn't follow the width")

        tabs = b.js("return gBrowser.tabs.length")
        size(1500)
        check(b.js("return gBrowser.tabs.length") == tabs, "changing modes changed the tabs")


def appearance_panel(shots):
    with Browser({}, tokens=tokens("catppuccin-mocha"), width=1800, height=1100) as b:
        d = b.js(r"""
            const button = document.getElementById("nyx-appearance-button");
            const r = button?.getBoundingClientRect();
            return { exists: !!button, w: r?.width, h: r?.height, area: button?.closest("toolbar")?.id, tip: button?.getAttribute("tooltiptext") };
        """)
        check(d["exists"] and d["w"] > 16 and d["h"] > 16, "the settings button isn't in the toolbar", d)
        check("Ctrl+," in (d["tip"] or ""), "the settings button's tooltip doesn't name its key", d)

        # Open by its shortcut, then press its real controls.
        click = r"""
            const done = arguments[arguments.length - 1];
            (async () => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", ctrlKey: true, bubbles: true, cancelable: true }));
              const panel = document.getElementById("nyx-appearance-panel");
              await new Promise(r => setTimeout(r, 500));
              const press = (label, text) => {
                const group = [...document.querySelectorAll("#nyx-appearance-body .nyx-seg")].find(g => g.getAttribute("aria-label") === label);
                [...group.querySelectorAll("button")].find(b => b.textContent === text).click();
              };
              press("Tabs", "Horizontal");
              await new Promise(r => setTimeout(r, 900));
              const horizontal = document.documentElement.hasAttribute("nyx-tabs-horizontal");
              const disabled = [...document.querySelectorAll("#nyx-appearance-body .nyx-seg")].find(g => g.getAttribute("aria-label") === "Sidebar").classList.contains("nyx-disabled");
              press("Tabs", "Vertical");
              await new Promise(r => setTimeout(r, 900));
              press("Sidebar", "Compact");
              press("Theme", "Light");
              press("Density", "Relaxed");
              document.querySelector("#nyx-appearance-body .nyx-swatch-green").click();
              document.querySelector("#nyx-appearance-body .nyx-switch-row").click();
              await new Promise(r => setTimeout(r, 700));
              done({
                state: panel?.state, horizontal, disabled,
                vertical: !document.documentElement.hasAttribute("nyx-tabs-horizontal"),
                sidebar: Services.prefs.getStringPref("nyx.sidebar.mode"),
                frosted: document.documentElement.hasAttribute("nyx-frosted"),
                file: await IOUtils.readJSON(NyxAppearance.file),
                checked: [...document.querySelectorAll("#nyx-appearance-body [aria-checked=true]")].map(e => e.textContent),
              });
            })();
        """
        d = b.js_async(click)
        check(d["horizontal"] and d["vertical"], "the Tabs control didn't switch orientation", d)
        check(d["disabled"], "Sidebar stayed enabled with horizontal tabs", d)
        check(d["sidebar"] == "compact", "the Sidebar control didn't change the mode", d)
        check(d["frosted"], "the Frosted control didn't apply", d)
        check(d["file"] == {"theme": "nyx-light", "accent": "green", "density": "relaxed"}, "the choices weren't saved", d)
        check("Light" in d["checked"] and "Relaxed" in d["checked"], "controls don't report their state", d)

        # The launcher turns the panel's file into the theme, end to end.
        env = {**os.environ, "XDG_CONFIG_HOME": str(b.home / ".config")}
        made = subprocess.check_output([str(ROOT / "target/debug/nyx-browser"), "--print-tokens"], env=env, text=True)
        check(value(made, "bg") == value(tokens("nyx-light"), "bg"), "the launcher ignored the chosen theme", made[:200])
        check(value(made, "accent") == value(made, "swatch-green"), "the launcher ignored the chosen accent", made[:400])
        check(value(made, "header") == "50px", "the launcher ignored the chosen density", made[:600])


def customizing(shots):
    """Firefox's toolbar customization opens and closes in both orientations."""
    for vertical in (True, False):
        with Browser({"zen.tabs.vertical": vertical}, tokens=tokens("catppuccin-mocha"), width=1800, height=1100) as b:
            d = b.js_async(r"""
                const done = arguments[arguments.length - 1];
                (async () => {
                  const events = t => new Promise(r => window.addEventListener(t, r, { once: true }));
                  const entered = events("customizationready");
                  gCustomizeMode.enter();
                  await entered;
                  const customizing = document.documentElement.hasAttribute("customizing");
                  const palette = !!document.getElementById("customization-palette");
                  const { CustomizableUI } = ChromeUtils.importESModule("moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs");
                  const before = CustomizableUI.getPlacementOfWidget("nyx-appearance-button");
                  CustomizableUI.removeWidgetFromArea("nyx-appearance-button");
                  const removed = CustomizableUI.getPlacementOfWidget("nyx-appearance-button");
                  CustomizableUI.addWidgetToArea("nyx-appearance-button", before.area);
                  const left = events("aftercustomization");
                  gCustomizeMode.exit();
                  await left;
                  await new Promise(r => setTimeout(r, 800));
                  const rows = gBrowser.tabContainer.getAttribute("orient");
                  done({ customizing, palette, before, removed, rows, ended: !document.documentElement.hasAttribute("customizing"),
                         tabs: gBrowser.tabs.length });
                })().catch(e => done({ error: String(e) }));
            """, timeout=40)
            check("error" not in d, "customizing threw", d)
            check(d["customizing"] and d["palette"] and d["ended"], "customization didn't open and close", d)
            check(d["removed"] is None and d["before"], "buttons can't be removed", d)
            check(d["rows"] == ("vertical" if vertical else "horizontal"), "customizing changed the orientation", d)


TESTS = [theme_files, security_indicator, sidebar_modes, appearance_panel, customizing]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots")
    opts = ap.parse_args()
    failed = 0
    for test in TESTS:
        try:
            test(opts.shots)
            print(f"PASS {test.__name__}", flush=True)
        except Exception as error:  # noqa: BLE001 - each test reports and the next still runs
            failed += 1
            print(f"FAIL {test.__name__}: {str(error)[:900]}", flush=True)
    print(f"\n{len(TESTS) - failed} of {len(TESTS)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
