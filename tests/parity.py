#!/usr/bin/env python3
"""The interface against the approved mockup, in each layout.

    tools/setup-runtime.sh && tests/parity.py [--shots DIR]

Checks what a person sees: which buttons exist, their order, what lines up, and that controls
really do what they show. Colors are checked in tests/look.py.
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import look  # noqa: E402
from marionette import Browser  # noqa: E402

# The mockup's top bar, left to right. Ids are Firefox's or this browser's own.
ACTIONS = [
    "nyx-share-button",
    "nyx-capture-button",
    "nyx-assistant-button",
    "nyx-passwords_design-nexus_github_io-browser-action",
    "unified-extensions-button",
    "downloads-button",
    "PanelUI-button",
    "nyx-appearance-button",
]
NAVIGATION = ["back-button", "forward-button", "stop-reload-button"]


def check(condition, message, detail=None):
    if not condition:
        raise AssertionError(message + (f": {json.dumps(detail, default=str)[:700]}" if detail is not None else ""))


READ_BAR = r"""
const box = id => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { id, x: r.x, y: r.y, w: r.width, h: r.height, shown: r.width > 0 && r.height > 0 && getComputedStyle(e).visibility === "visible" }; };
const [navigation, actions] = arguments;
const wc = document.querySelector(".titlebar-buttonbox-container");
return {
  navigation: navigation.map(box), actions: actions.map(box),
  address: box("urlbar-container"), star: box("star-button-box"), qr: box("nyx-qr-button"),
  sidebarButton: box("nyx-sidebar-button"), compactToggle: box("zen-toggle-compact-mode"),
  controls: wc ? wc.getBoundingClientRect().width : 0,
  copy: box("zen-copy-url-button"), identity: box("identity-icon"),
  win: innerWidth,
};
"""


def top_bar(b, horizontal):
    d = b.js(READ_BAR, NAVIGATION, ACTIONS)
    for item in d["navigation"] + d["actions"]:
        check(item and item["shown"], "a top bar button is missing", item)
    order = d["navigation"] + [d["address"]] + d["actions"]
    for left, right in zip(order, order[1:]):
        check(left["x"] + left["w"] <= right["x"] + 1, "the top bar is out of order", [left, right])
    check(d["actions"][-1]["id"] == "nyx-appearance-button", "Settings isn't last")
    check(d["actions"][-1]["x"] + d["actions"][-1]["w"] <= d["win"], "Settings is off screen", d["actions"][-1])
    check(d["controls"] == 0, "window controls are showing", d["controls"])
    check(not d["compactToggle"] or not d["compactToggle"]["shown"], "Zen's compact toggle is still there", d["compactToggle"])
    check(not d["copy"] or not d["copy"]["shown"], "Zen's copy button is still in the address bar", d["copy"])

    centers = [i["y"] + i["h"] / 2 for i in order]
    if not horizontal:
        centers.append(d["sidebarButton"]["y"] + d["sidebarButton"]["h"] / 2)
    check(max(centers) - min(centers) <= 1.5, "the top bar isn't level", sorted(round(c, 1) for c in centers))


def address_bar(b, horizontal):
    b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const tab = gBrowser.addTab("data:text/html,<title>Plain</title>page", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
        gBrowser.selectedTab = tab;
        setTimeout(() => done(null), 1200);
    """)
    d = b.js(READ_BAR, NAVIGATION, ACTIONS)
    star, qr, address, identity = d["star"], d["qr"], d["address"], d["identity"]
    check(star and star["shown"], "the favorite star is missing", star)
    check(qr and qr["shown"], "the QR button is missing", qr)
    gap = max(star["x"] - (qr["x"] + qr["w"]), qr["x"] - (star["x"] + star["w"]))
    check(gap <= 4, "the QR button isn't next to the star", [star, qr])
    check(identity and identity["shown"], "the security icon is missing", identity)
    check(identity["x"] < star["x"] and max(star["x"], qr["x"]) + 16 <= address["x"] + address["w"], "the address bar's icons are misplaced", d)


def qr_dialog(b, horizontal):
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        gBrowser.selectedTab = gBrowser.addTab("https://example.invalid/page", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
        setTimeout(() => {
        document.getElementById("nyx-qr-button").click();
        setTimeout(() => {
          const frames = [...document.querySelectorAll("browser, iframe")].map(f => f.getAttribute("src") || f.currentURI?.spec || "");
          const open = frames.some(u => u.includes("qrcode"));
          for (const box of document.querySelectorAll(".dialogBox")) box.querySelector("browser")?.contentWindow?.close?.();
          done({ open, frames: frames.filter(u => u.includes("chrome:")).slice(0, 8) });
        }, 1500);
        }, 1500);
    """)
    check(d["open"], "the QR button didn't open the QR dialog", d)


def collapse_button(b, horizontal):
    if horizontal:
        d = b.js("const e = document.getElementById('nyx-sidebar-button'); return e ? e.getBoundingClientRect().width : 0")
        check(d == 0, "horizontal tabs show a sidebar button", d)
        return
    read = "return { w: Math.round(gNavToolbox.getBoundingClientRect().width), mode: Services.prefs.getStringPref('nyx.sidebar.mode'), attr: document.documentElement.getAttribute('nyx-sidebar'), on: document.getElementById('nyx-sidebar-button').hasAttribute('checked') }"
    press = "document.getElementById('nyx-sidebar-button').doCommand()"
    start = b.js(read)
    check(start["attr"] == "expanded" and start["on"], "the sidebar should start open and the button tinted", start)
    b.js(press)
    time.sleep(1)
    closed = b.js(read)
    check(closed["w"] < 90 and closed["attr"] == "compact", "the button didn't collapse the sidebar", closed)
    check(not closed["on"], "the button stayed tinted when collapsed", closed)
    # Automatic mustn't undo it.
    b.js("window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('activate'))")
    time.sleep(1)
    check(b.js(read)["w"] < 90, "the sidebar reopened by itself after a resize", b.js(read))
    b.js(press)
    time.sleep(1)
    opened = b.js(read)
    check(opened["w"] > 150 and opened["on"], "the button didn't reopen the sidebar", opened)

    b.js("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }))")
    time.sleep(1)
    check(b.js(read)["w"] < 90, "Ctrl+B didn't collapse the sidebar", b.js(read))
    b.js(press)
    time.sleep(1)
    b.js("Services.prefs.setStringPref('nyx.sidebar.mode', 'expanded')")
    time.sleep(0.5)


def sidebar_parts(b, horizontal):
    d = b.js(r"""
        const box = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, text: e.textContent?.trim().slice(0, 30) }; };
        const space = gZenWorkspaces.activeWorkspaceElement;
        const q = s => space.querySelector(s);
        const icon = q(".zen-current-workspace-indicator-icon");
        return {
          indicator: box(q(".zen-current-workspace-indicator")),
          name: box(q(".zen-current-workspace-indicator-name")),
          wsIcon: box(icon), wsIconFill: icon ? getComputedStyle(icon).maskImage : "",
          chevron: box(q(".nyx-workspace-menu-button")), search: box(q(".nyx-tab-search")),
          folders: box(q(".nyx-folders-header")), foldersAdd: box(q(".nyx-folders-header .nyx-add")),
          newTab: box(space.querySelector("#tabs-newtab-button")),
          newTabLabel: box(space.querySelector("#tabs-newtab-button .toolbarbutton-text")),
          newTabText: space.querySelector("#tabs-newtab-button")?.getAttribute("label"),
          library: box(document.getElementById("zen-library-button")),
          createNew: box(document.getElementById("zen-create-new-button")),
          foot: box(document.getElementById("nyx-sidebar-foot")),
          footSpaces: document.querySelectorAll("#nyx-sidebar-foot .nyx-space").length,
          footAdd: box(document.querySelector("#nyx-sidebar-foot .nyx-add")),
          shortcuts: box(document.querySelector("#nyx-sidebar-foot .nyx-shortcuts")),
          tabs: box(gBrowser.visibleTabs.findLast(t => !t.pinned)),
          toolbox: box(gNavToolbox),
        };
    """)
    visible = lambda part: part and part["w"] > 0 and part["h"] > 0
    check(visible(d["wsIcon"]), "the workspace has no icon", d["wsIcon"])
    check(visible(d["chevron"]), "the workspace row has no chevron", d["chevron"])
    check(not visible(d["library"]), "the Library button is still there", d["library"])
    check(not b.js("return !!document.querySelector('zen-sidebar-notification')"), "Zen's update card is showing")
    check(not visible(d["createNew"]), "Zen's create button is still there", d["createNew"])
    if horizontal:
        check(visible(d["name"]), "the workspace chip has no name", d)
        return
    check(visible(d["name"]) and visible(d["search"]), "the workspace row is missing parts", d)
    check(d["indicator"]["x"] >= d["toolbox"]["x"] + 4, "the workspace row runs to the window's edge", d["indicator"])
    check(visible(d["folders"]) and d["folders"]["text"].lower().startswith("folders"), "there's no Folders section", d["folders"])
    check(visible(d["foldersAdd"]), "the Folders section has no add button", d["foldersAdd"])
    check(visible(d["newTabLabel"]) and d["newTabText"] == "New tab", "there's no New tab row", d)
    check(d["newTab"]["w"] > 120, "the New tab row isn't a full row", d["newTab"])
    check(visible(d["foot"]) and d["footSpaces"] >= 1 and visible(d["footAdd"]) and visible(d["shortcuts"]), "the sidebar's foot is missing parts", d)


def hidden_mode(b, horizontal):
    """Hidden still has its button in the top bar, and it reveals the sidebar."""
    if horizontal:
        return
    read = r"""
        const b = document.getElementById("nyx-sidebar-button").getBoundingClientRect();
        const t = gNavToolbox.getBoundingClientRect();
        const p = document.getElementById("tabbrowser-tabbox").getBoundingClientRect();
        return { attr: document.documentElement.getAttribute("nyx-sidebar"), button: [b.x, b.y, b.width, b.height], toolbox: [t.x, t.right], page: [p.x, p.width], win: innerWidth,
                 on: document.getElementById("nyx-sidebar-button").hasAttribute("checked") };
    """
    b.js("Services.prefs.setStringPref('nyx.sidebar.mode', 'hidden')")
    time.sleep(1.2)
    try:
        d = b.js(read)
        check(d["attr"] == "hidden" and d["toolbox"][1] <= 6, "hidden mode didn't hide the sidebar", d)
        check(d["page"][1] >= d["win"] - 20, "hidden mode didn't give the page the window", d)
        check(d["button"][2] > 0 and 0 <= d["button"][1] < 46, "hidden mode lost the sidebar button", d)
        b.js("document.getElementById('nyx-sidebar-button').doCommand()")
        time.sleep(0.8)
        shown = b.js(read)
        check(shown["toolbox"][1] > 100 and shown["on"], "the button didn't reveal the sidebar", shown)
        b.js("document.getElementById('nyx-sidebar-button').doCommand()")
        time.sleep(0.8)
        check(b.js(read)["toolbox"][1] <= 6, "the button didn't hide the sidebar again", b.js(read))
    finally:
        b.js("Services.prefs.setStringPref('nyx.sidebar.mode', 'expanded')")
        time.sleep(1.2)


def folder_add(b, horizontal):
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const count = () => document.querySelectorAll("zen-folder").length;
        const before = count();
        gZenWorkspaces.activeWorkspaceElement.querySelector(".nyx-folders-header .nyx-add").doCommand();
        setTimeout(() => {
          const created = count();
          const header = gZenWorkspaces.activeWorkspaceElement.querySelector(".nyx-folders-header");
          const folder = document.querySelector("zen-folder");
          const next = header.nextElementSibling;
          const gone = () => { for (const f of document.querySelectorAll("zen-folder")) f.delete?.(); };
          const result = { before, created, nextIsFolder: next?.localName === "zen-folder", follows: !!folder && header.getBoundingClientRect().bottom <= folder.getBoundingClientRect().top + 1 };
          document.activeElement?.blur?.();
          Promise.resolve(gone()).finally(() => setTimeout(() => done(result), 500));
        }, 1000);
    """)
    check(d["created"] == d["before"] + 1, "the Folders add button didn't make a folder", d)
    check(d["nextIsFolder"] and d["follows"], "the new folder isn't under the Folders label", d)


def settings_button(b, horizontal):
    """Clicking the real button opens Appearance. A shortcut working doesn't prove this."""
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        document.getElementById("nyx-appearance-button").doCommand();
        setTimeout(() => {
          const panel = document.getElementById("nyx-appearance-panel");
          const state = panel?.state;
          panel?.hidePopup();
          done({ state });
        }, 800);
    """)
    check(d["state"] in ("open", "showing"), "the Settings button didn't open Appearance", d)


def narrow_window(b, horizontal):
    """Every button stays in the row when the window narrows; none go to an overflow menu."""
    b.js("window.resizeTo(1100, 900)")
    time.sleep(1.5)
    try:
        d = b.js(READ_BAR, NAVIGATION, ACTIONS)
        for item in d["navigation"] + d["actions"]:
            check(item and item["shown"], "a button left the row in a narrow window", item)
        check(d["actions"][-1]["x"] + d["actions"][-1]["w"] <= d["win"], "Settings is off screen in a narrow window", d["actions"][-1])
        check(d["address"]["w"] > 150, "the address bar is too small in a narrow window", d["address"])
    finally:
        b.js("window.resizeTo(1500, 900)")
        time.sleep(1.5)


def page_fills_below_header(b, horizontal):
    d = b.js(r"""
        const page = document.getElementById("tabbrowser-tabbox").getBoundingClientRect();
        return { top: page.top, bottom: page.bottom, h: innerHeight, strip: gNavToolbox.getBoundingClientRect().bottom };
    """)
    limit = 90 if horizontal else 54
    check(d["top"] <= limit, "there's a gap above the page", d)
    check(d["bottom"] >= d["h"] - 12, "there's a gap below the page", d)


def shortcuts_button(b, horizontal):
    """F1 Shortcuts really opens the page that lists the shortcuts."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        document.querySelector("#nyx-sidebar-foot .nyx-shortcuts").doCommand();
        setTimeout(() => {
          const browser = gBrowser.selectedBrowser;
          const url = browser.currentURI.spec;
          const doc = browser.contentDocument;
          const shown = doc ? [...doc.querySelectorAll("[data-category]")].filter(e => !e.hidden && e.getBoundingClientRect().height > 0).map(e => e.getAttribute("data-category")) : [];
          const pane = doc?.querySelector("#categories richlistitem[selected], .category[selected]")?.id;
          done({ url, pane, shown: [...new Set(shown)].slice(0, 5), keys: doc ? doc.querySelectorAll("[id*='zenCKS'], [id*='CKS'], .zenCKSOption").length : -1 });
        }, 2500);
    """, timeout=15)
    check("preferences" in d["url"], "F1 Shortcuts didn't open settings", d)
    check(d["keys"] > 0 or any("CKS" in c for c in d["shown"]), "F1 Shortcuts didn't reach the shortcuts page", d)


def foot_workspaces(b, horizontal):
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        (async () => {
          const first = gZenWorkspaces.activeWorkspace;
          const made = await gZenWorkspaces.createAndSaveWorkspace("Second", undefined, false, 0);
          await new Promise(r => setTimeout(r, 900));
          const spaces = () => [...document.querySelectorAll("#nyx-sidebar-foot .nyx-space")];
          const count = spaces().length;
          spaces()[1].doCommand();
          await new Promise(r => setTimeout(r, 900));
          const moved = gZenWorkspaces.activeWorkspace === made.uuid;
          const marked = spaces()[1].hasAttribute("checked");
          await gZenWorkspaces.changeWorkspaceWithID(first);
          await new Promise(r => setTimeout(r, 500));
          await gZenWorkspaces.removeWorkspace(made.uuid);
          await new Promise(r => setTimeout(r, 700));
          done({ count, moved, marked, after: spaces().length });
        })().catch(e => done({ error: String(e) }));
    """, timeout=40)
    check("error" not in d, "workspaces failed", d)
    check(d["count"] == 2 and d["after"] == 1, "the foot doesn't follow the workspaces", d)
    check(d["moved"] and d["marked"], "the foot's icons don't switch workspace", d)


def workspace_menu(b, horizontal):
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        gZenWorkspaces.activeWorkspaceElement.querySelector(".nyx-workspace-menu-button").click();
        setTimeout(() => {
          const menu = document.getElementById("nyx-workspace-menu");
          const items = menu ? [...menu.children].map(i => i.getAttribute("label") || i.localName) : [];
          const state = menu?.state;
          menu?.hidePopup();
          done({ state, items });
        }, 800);
    """)
    check(d["state"] in ("open", "showing"), "the workspace chevron didn't open a menu", d)
    check(any("New workspace" in i for i in d["items"]), "the workspace menu can't create one", d)


def popups(b, horizontal):
    """Each top bar button opens its panel, from the real button."""
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const open = async (buttonId, panelId) => {
          const button = document.getElementById(buttonId);
          const inner = button.matches("toolbaritem") ? button.querySelector("toolbarbutton") : button;
          // Firefox's Downloads button opens on mouse down, the others on a click.
          inner.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, button: 0 }));
          if (buttonId !== "downloads-button") {
            inner.click();
          }
          await new Promise(r => setTimeout(r, 1200));
          const panel = document.getElementById(panelId);
          const state = panel?.state;
          const radius = panel ? getComputedStyle(panel).getPropertyValue("--arrowpanel-menuitem-border-radius").trim() : "";
          panel?.hidePopup?.();
          await new Promise(r => setTimeout(r, 300));
          return { state, radius };
        };
        (async () => {
          done({
            more: await open("PanelUI-menu-button", "appMenu-popup"),
            downloads: await open("downloads-button", "downloadsPanel"),
            extensions: await open("unified-extensions-button", "unified-extensions-panel"),
            passwords: await (async () => {
              const item = document.getElementById("nyx-passwords_design-nexus_github_io-browser-action");
              const button = item.querySelector(".unified-extensions-item-action-button") || item;
              button.click();
              await new Promise(r => setTimeout(r, 2000));
              const panel = [...document.querySelectorAll("panel")].find(p => p.state === "open" || p.state === "showing");
              const state = panel?.state;
              panel?.hidePopup?.();
              return { state };
            })(),
          });
        })().catch(e => done({ error: String(e) }));
    """, timeout=30)
    check("error" not in d, "opening a panel threw", d)
    for name in ("more", "downloads", "extensions", "passwords"):
        check(d[name]["state"] in ("open", "showing"), f"the {name} button didn't open its panel", d)


TESTS = [top_bar, narrow_window, page_fills_below_header, settings_button, address_bar, qr_dialog, collapse_button, hidden_mode, sidebar_parts, shortcuts_button, folder_add, foot_workspaces, workspace_menu, popups]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots")
    ap.add_argument("--only")
    opts = ap.parse_args()
    results = []
    tokens = look.tokens("catppuccin-mocha")
    for name, horizontal, prefs in (
        ("expanded", False, {"zen.tabs.vertical": True, "nyx.sidebar.mode": "expanded"}),
        ("rail", False, {"zen.tabs.vertical": True, "nyx.sidebar.mode": "compact"}),
        ("horizontal", True, {"zen.tabs.vertical": False}),
    ):
        with Browser(prefs, tokens=tokens, width=1700, height=1000) as b:
            b.js("window.resizeTo(1500, 900)")
            time.sleep(2.5)
            if opts.shots:
                b.screenshot(Path(opts.shots) / f"parity-{name}.png")
            for test in TESTS:
                if opts.only and opts.only != test.__name__:
                    continue
                if name == "rail" and test in (collapse_button, hidden_mode, sidebar_parts, shortcuts_button, folder_add, foot_workspaces):
                    continue
                try:
                    test(b, horizontal)
                    results.append(True)
                    print(f"PASS {name:11} {test.__name__}", flush=True)
                except Exception as error:  # noqa: BLE001 - each test reports and the next still runs
                    results.append(False)
                    print(f"FAIL {name:11} {test.__name__}: {str(error)[:800]}", flush=True)
    print(f"\n{sum(results)} of {len(results)} passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
