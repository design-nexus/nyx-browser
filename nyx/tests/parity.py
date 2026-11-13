#!/usr/bin/env python3
"""The interface against the approved mockup, in each layout.

    tests/parity.py [--shots DIR]

Checks what a person sees: which buttons exist, their order, what lines up, and that controls
really do what they show. Colors are checked in tests/look.py.
"""

import argparse
import http.server
import json
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import look  # noqa: E402
from marionette import Browser  # noqa: E402

# The mockup's top bar, left to right. Ids are Firefox's or this browser's own.
PASSWORDS = "nyx-passwords_design-nexus_github_io-browser-action"
ACTIONS = [
    "nyx-share-button",
    "nyx-capture-button",
    "nyx-assistant-button",
    PASSWORDS,
    "unified-extensions-button",
    "downloads-button",
    "nyx-settings-button",
    "PanelUI-button",
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
    check(d["actions"][-1]["id"] == "PanelUI-button", "the menu isn't last")
    check(d["actions"][-2]["id"] == "nyx-settings-button", "Settings isn't beside the menu")
    check(d["actions"][-1]["x"] + d["actions"][-1]["w"] <= d["win"], "the menu is off screen", d["actions"][-1])
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
        const tab = gBrowser.addTab("https://example.invalid/page", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
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


OPEN_AND_READ_BUTTONS = r"""
    const done = arguments[arguments.length - 1];
    const [url] = arguments;
    gBrowser.selectedTab = gBrowser.addTab(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
    setTimeout(async () => {
      const read = async id => {
        const e = document.getElementById(id);
        if (!e) return null;
        const { id: l10n } = document.l10n.getAttributes(e);
        await document.l10n.translateElements([e]);
        return { disabled: e.disabled, l10n, tip: e.getAttribute("tooltiptext") || "" };
      };
      const qr = document.getElementById("nyx-qr-button");
      done({ url: gBrowser.currentURI.spec, share: await read("nyx-share-button"), capture: await read("nyx-capture-button"), qr: !!qr && !qr.hidden && qr.getBoundingClientRect().width > 0 });
    }, 1800);
"""


def page_buttons(b, horizontal):
    """Share, Capture and the QR button follow the page: usable on a web page, greyed out with a reason, or gone."""
    web = b.js_async(OPEN_AND_READ_BUTTONS, "https://example.invalid/page", timeout=15)
    check(web["qr"], "the QR button is missing on a web page", web)
    check(not web["share"]["disabled"], "Share is greyed out on a web page", web)
    for url in ("about:preferences", "about:blank", "data:text/html,<title>Plain</title>page"):
        d = b.js_async(OPEN_AND_READ_BUTTONS, url, timeout=15)
        check(not d["qr"], "the QR button shows on a page it can't share", d)
        check(d["share"]["disabled"] and d["share"]["l10n"] == "nyx-share-button-unavailable", "Share isn't greyed out on a page it can't send", d)
        check("can’t be shared" in d["share"]["tip"], "greyed-out Share doesn't say why", d)
    settings = b.js_async(OPEN_AND_READ_BUTTONS, "about:preferences", timeout=15)
    check(settings["capture"]["disabled"] and "can’t be captured" in settings["capture"]["tip"], "Capture isn't greyed out on Browser's own page", settings)


def extensions_panel(b, horizontal):
    """The Extensions button lists what's installed, without Browser's own parts; with nothing to
    list it opens the Add-ons page, as Firefox does."""
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const show = async () => {
          const tabs = gBrowser.tabs.length;
          const button = document.getElementById("unified-extensions-button");
          button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, button: 0 }));
          await new Promise(r => setTimeout(r, 1500));
          const panel = document.getElementById("unified-extensions-panel");
          const view = panel.querySelector(`#${panel.querySelector("panelmultiview").getAttribute("mainViewId")}`);
          const out = {
            open: panel.state === "open" || panel.state === "showing",
            names: [...view.querySelectorAll(".unified-extensions-item")].filter(i => i.getBoundingClientRect().height > 0).map(i => i.querySelector(".unified-extensions-item-name")?.textContent.trim()),
            page: gBrowser.tabs.length > tabs ? gBrowser.selectedBrowser.currentURI.spec : null,
          };
          PanelMultiView.hidePopup(panel);
          if (out.page) {
            gBrowser.removeTab(gBrowser.selectedTab);
          }
          await new Promise(r => setTimeout(r, 400));
          return out;
        };
        (async () => {
          const before = await show();
          const dir = Services.dirsvc.get("TmpD", Ci.nsIFile);
          dir.append("nyx-parity-extension");
          await IOUtils.makeDirectory(dir.path, { ignoreExisting: true });
          await IOUtils.writeUTF8(PathUtils.join(dir.path, "manifest.json"), JSON.stringify({
            manifest_version: 2, name: "Parity Extension", version: "1.0",
            browser_specific_settings: { gecko: { id: "parity@nyx.test" } }, browser_action: { default_title: "Parity" },
          }));
          const addon = await AddonManager.installTemporaryAddon(dir);
          await new Promise(r => setTimeout(r, 1000));
          const after = await show();
          await addon.uninstall();
          done({ before, after });
        })().catch(e => done({ error: String(e) }));
    """, timeout=40)
    check("error" not in d, "the extensions panel test threw", d)
    # Passwords, when it's installed, is pinned to the bar and so isn't listed.
    check(not d["before"]["open"] and (d["before"]["page"] or "").startswith("about:addons"), "with nothing to list, the button didn't open the Add-ons page", d)
    check(d["after"]["open"] and d["after"]["names"] == ["Parity Extension"], "the panel doesn't list the extension, or lists Browser's own", d)


def dropdowns(b, horizontal):
    """Every dropdown follows one spec: panels 336 px wide with 32 px rows and a 15 px semibold
    title, menus at least 240 px with 30 px rows, all in 13 px text."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        const closeAll = async () => { for (const p of document.querySelectorAll("panel, menupopup")) if (p.state === "open" || p.state === "showing") p.hidePopup(); await pause(400); };
        const shown = e => e.getBoundingClientRect().height > 0;
        const panel = (popup, rowsSelector) => {
          const view = popup.querySelector("panelview[current], panelview[visible]") || popup.querySelector("panelview") || popup;
          const rows = [...view.querySelectorAll(rowsSelector)].filter(shown).slice(0, 4);
          const title = view.querySelector(".panel-header h1");
          return {
            width: Math.round(view.getBoundingClientRect().width),
            rows: rows.map(e => Math.round(e.getBoundingClientRect().height)),
            font: rows[0] && getComputedStyle(rows[0]).fontSize,
            title: title && shown(title) ? [getComputedStyle(title).fontSize, getComputedStyle(title).fontWeight] : null,
          };
        };
        (async () => {
          const out = {};
          await closeAll();
          PanelUI.show(); await pause(1000);
          out.appMenu = panel(document.getElementById("appMenu-popup"), "#appMenu-mainView .subviewbutton:not(#appMenu-zoom-controls *)");
          document.getElementById("appMenu-history-button").click(); await pause(1000);
          out.history = panel(document.getElementById("appMenu-popup"), "#PanelUI-history .subviewbutton");
          await closeAll();
          DownloadsPanel.showPanel(); await pause(1200);
          out.downloads = panel(document.getElementById("downloadsPanel"), ".downloadsPanelFooterButton, .subviewbutton");
          await closeAll();
          document.getElementById("identity-icon-box").dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 })); await pause(1200);
          const site = [...document.querySelectorAll("panel")].find(p => p.state === "open");
          out.site = site ? panel(site, ".subviewbutton") : null;
          await closeAll();
          const menu = document.getElementById("tabContextMenu");
          menu.openPopupAtScreen(300, 300, true); await pause(800);
          const items = [...menu.querySelectorAll(":scope > menuitem")].filter(shown).slice(0, 3);
          out.menu = { width: Math.round(menu.getBoundingClientRect().width), rows: items.map(e => Math.round(e.getBoundingClientRect().height)), font: getComputedStyle(items[0]).fontSize };
          await closeAll();
          done(out);
        })().catch(e => done({ error: String(e) }));
    """, timeout=40)
    check("error" not in d, "measuring the dropdowns threw", d)
    for name in ("appMenu", "history", "downloads", "site"):
        p = d[name]
        check(p and p["width"] == 336, f"the {name} panel isn't 336 px wide", d)
        check(p["rows"] and all(h == 32 for h in p["rows"]), f"the {name} panel's rows aren't 32 px", d)
        check(p["font"] == "13px", f"the {name} panel's text isn't 13 px", d)
    check(d["history"]["title"] == ["15px", "600"], "a panel's title isn't 15 px semibold", d)
    check(d["menu"]["width"] >= 240 and all(h == 30 for h in d["menu"]["rows"]) and d["menu"]["font"] == "13px", "a menu doesn't follow the spec", d)


SHARE_DESTINATIONS = [
    {"id": "clipboard", "name": "Copy", "icon": "edit-copy-symbolic", "tint": "graphite", "section": "apps", "available": True, "status": None},
    {"id": "mail", "name": "Mail", "icon": "mail-send-symbolic", "tint": "blue", "section": "apps", "available": True, "status": None},
    {"id": "phone", "name": "Phone", "icon": "phone-symbolic", "tint": "green", "section": "devices", "available": False, "status": "Not connected"},
]

OPEN_SHARE = r"""
    const done = arguments[arguments.length - 1];
    (async () => {
      const pause = ms => new Promise(r => setTimeout(r, ms));
      gBrowser.selectedTab = gBrowser.addTab("https://example.invalid/page", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      await pause(1500);
      document.getElementById("nyx-share-button").click();
      await pause(2000);
      const view = document.getElementById("PanelUI-nyx-share");
      const panel = view?.closest("panel");
      done({
        open: panel?.state === "open",
        title: view?.querySelector(".panel-header h1")?.textContent,
        rows: [...(view?.querySelectorAll(".nyx-share-destination") ?? [])].map(r => ({ name: r.getAttribute("label"), off: r.disabled, status: r.getAttribute("nyx-status"), icon: r.getAttribute("image") })),
        note: view?.querySelector(".nyx-share-note")?.textContent ?? null,
        more: !!view?.querySelector("#nyx-share-more"),
      });
    })().catch(e => done({ error: String(e) }));
"""


def share_menu(b, horizontal):
    """Share opens a dropdown of where Share sends a page in one click; a pick sends it there."""
    if horizontal:
        return
    destinations = b.home / "share-destinations.json"
    sent = b.home / "share-sent.log"
    destinations.write_text(json.dumps(SHARE_DESTINATIONS))
    sent.unlink(missing_ok=True)
    try:
        d = b.js_async(OPEN_SHARE, timeout=20)
        check("error" not in d and d["open"], "the Share button didn't open its dropdown", d)
        check(d["title"] == "Share" and d["more"], "the dropdown's title or its More in Share row is missing", d)
        check([r["name"] for r in d["rows"]] == ["Copy", "Mail", "Phone"], "the dropdown doesn't list Share's destinations", d)
        phone = d["rows"][2]
        check(phone["off"] and phone["status"] == "Not connected", "an unavailable destination isn't greyed out with its reason", d)
        check(d["rows"][0]["icon"].endswith("/copy.svg") and d["rows"][1]["icon"].endswith("/mail.svg"), "the destinations don't have Browser's icons", d)
        picked = b.js_async(r"""
            const done = arguments[arguments.length - 1];
            const row = [...document.querySelectorAll("#PanelUI-nyx-share .nyx-share-destination")].find(r => r.getAttribute("label") === "Mail");
            row.doCommand();
            // A closed panel gives its view back to the view cache.
            setTimeout(() => done({ open: document.getElementById("PanelUI-nyx-share").closest("panel")?.state ?? "closed" }), 1500);
        """, timeout=15)
        check(sent.exists() and sent.read_text().split() == ["mail", "https://example.invalid/page"], "picking Mail didn't send the page there", [sent.read_text() if sent.exists() else None])
        check(picked["open"] == "closed", "the dropdown stayed open after sending", picked)

        destinations.unlink()
        d = b.js_async(OPEN_SHARE, timeout=20)
        check(d["open"] and d["note"] == "Share isn't available." and d["more"], "a missing Share isn't said in the dropdown", d)
        b.js("CustomizableUI.hidePanelForNode(document.getElementById('PanelUI-nyx-share'))")
    finally:
        destinations.unlink(missing_ok=True)


def page_menu(b, horizontal):
    """The page's menu has Browser's items on web pages only, and no Firefox Screenshots."""
    def menu(url):
        b.js_async(r"""
            const done = arguments[arguments.length - 1];
            gBrowser.selectedTab = gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
            setTimeout(() => done(null), 2000);
        """, url, timeout=15)
        x, y = b.js("const r = gBrowser.selectedBrowser.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height * 0.8)];")
        b._call("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"}, "actions": [
            {"type": "pointerMove", "x": x, "y": y, "origin": "viewport"}, {"type": "pointerDown", "button": 2}, {"type": "pointerUp", "button": 2}]}]})
        b._call("WebDriver:ReleaseActions", {})
        time.sleep(1)
        return b.js(r"""
            const m = document.getElementById("contentAreaContextMenu");
            const labels = [...m.children].filter(e => !e.hidden && !e.collapsed && e.localName !== "menuseparator").map(e => e.id || e.label);
            const nyx = [...m.children].find(e => e.label === "Nyx" && !e.hidden);
            const items = nyx ? [...nyx.querySelectorAll("menuitem")].map(e => e.label) : [];
            m.hidePopup();
            return { labels, nyx: !!nyx, items };
        """)
    class Page(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = b"<!doctype html><title>Plain</title><p>A plain page.</p>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Page)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        web = menu(f"http://127.0.0.1:{server.server_address[1]}/")
    finally:
        server.shutdown()
    dashboard = menu("about:newtab")
    check(web["nyx"] and "Share this page" in web["items"], "Browser's page menu is missing on a web page", web)
    check(not dashboard["nyx"], "Browser's page menu shows on the dashboard", dashboard)
    for d in (web, dashboard):
        check("context-take-screenshot" not in d["labels"], "Firefox's Take Screenshot is in the page menu", d)


def sidebar_header(b, horizontal):
    """Firefox's sidebar header is in the theme, and Bookmarks doesn't claim Browser's Ctrl+B."""
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        SidebarController.show("viewBookmarksSidebar").then(() => setTimeout(() => {
          const root = getComputedStyle(document.documentElement);
          const probe = document.createElement("div");
          document.documentElement.append(probe);
          const color = v => { probe.style.color = v; return getComputedStyle(probe).color; };
          const header = document.getElementById("sidebar-header");
          const out = {
            text: getComputedStyle(document.getElementById("sidebar-title")).color,
            nyxText: color(root.getPropertyValue("--nyx-text")),
            key: ShortcutUtils.prettifyShortcut(document.getElementById("viewBookmarksSidebarKb")),
            shown: header.getBoundingClientRect().height > 0,
          };
          probe.remove();
          SidebarController.hide();
          done(out);
        }, 800));
    """, timeout=15)
    check(d["shown"], "the sidebar header didn't show", d)
    check(d["text"] == d["nyxText"], "the sidebar title isn't in the theme's text colour", d)
    check(d["key"] == "", "the bookmarks sidebar still claims a shortcut", d)


def settings_theme(b, horizontal):
    """Settings is drawn in the theme: its surface, text and font."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const tab = gBrowser.addTab("about:preferences", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
        gBrowser.selectedTab = tab;
        setTimeout(() => {
          const doc = tab.linkedBrowser.contentDocument;
          const win = doc.defaultView;
          const root = win.getComputedStyle(doc.documentElement);
          const probe = doc.createElement("div");
          doc.body.append(probe);
          const color = v => { probe.style.color = v; return win.getComputedStyle(probe).color; };
          const out = {
            bg: [doc.body, doc.documentElement].map(e => win.getComputedStyle(e).backgroundColor).find(c => c !== "rgba(0, 0, 0, 0)"),
            surface: color(root.getPropertyValue("--nyx-surface") || root.getPropertyValue("--nyx-bg")),
            text: win.getComputedStyle(doc.body).color,
            nyxText: color(root.getPropertyValue("--nyx-text")),
            font: root.fontFamily,
          };
          probe.remove();
          done(out);
        }, 2500);
    """, timeout=20)
    check(d["bg"] == d["surface"], "Settings isn't on the theme's surface", d)
    check(d["text"] == d["nyxText"], "Settings' text isn't the theme's", d)
    check("Inter" in d["font"], "Settings isn't in the theme's font", d)


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
          chevron: box(q(".nyx-workspace-menu-chevron")), search: box(q(".nyx-tab-search-button")),
          chip: box(document.querySelector("#nyx-workspace-chip .nyx-workspace-chip-name")),
          chipChevron: box(document.querySelector("#nyx-workspace-chip .nyx-workspace-menu-chevron")),
          rowSearch: box(document.getElementById("nyx-row-tab-search")),
          folders: box(q(".nyx-folders-header")), foldersAdd: box(q(".nyx-folders-header .nyx-new-folder-button")),
          newTab: box(space.querySelector("#tabs-newtab-button")),
          newTabLabel: box(space.querySelector("#tabs-newtab-button .toolbarbutton-text")),
          newTabText: space.querySelector("#tabs-newtab-button")?.getAttribute("label"),
          library: box(document.getElementById("zen-library-button")),
          createNew: box(document.getElementById("zen-create-new-button")),
          foot: box(document.getElementById("zen-sidebar-foot-buttons")),
          footSpaces: document.querySelectorAll("#zen-workspaces-button > toolbarbutton").length,
          footAdd: box(document.getElementById("zen-create-new-button")),
          shortcuts: !!document.getElementById("nyx-shortcuts-button"),
          tabs: box(gBrowser.visibleTabs.findLast(t => !t.pinned)),
          toolbox: box(gNavToolbox),
        };
    """)
    visible = lambda part: part and part["w"] > 0 and part["h"] > 0
    check(not visible(d["library"]), "the Library button is still there", d["library"])
    check(not b.js("return !!document.querySelector('zen-sidebar-notification')"), "Zen's update card is showing")
    if horizontal:
        check(visible(d["chip"]) and d["chip"]["text"], "the workspace chip has no name", d)
        check(visible(d["chipChevron"]) and visible(d["rowSearch"]), "the tab row is missing its chevron or search", d)
        return
    check(visible(d["wsIcon"]) and d["wsIcon"]["text"], "the workspace has no icon or initial", d["wsIcon"])
    check(visible(d["chevron"]), "the workspace row has no chevron", d["chevron"])
    check(visible(d["name"]) and visible(d["search"]), "the workspace row is missing parts", d)
    check(d["indicator"]["x"] >= d["toolbox"]["x"] + 4, "the workspace row runs to the window's edge", d["indicator"])
    check(visible(d["folders"]) and d["folders"]["text"].lower().startswith("folders"), "there's no Folders section", d["folders"])
    check(visible(d["foldersAdd"]), "the Folders section has no add button", d["foldersAdd"])
    check(visible(d["newTabLabel"]) and d["newTabText"] == "New tab", "there's no New tab row", d)
    check(d["newTab"]["w"] > 120, "the New tab row isn't a full row", d["newTab"])
    check(visible(d["foot"]) and d["footSpaces"] >= 1 and visible(d["footAdd"]), "the sidebar's foot is missing parts", d)
    check(not d["shortcuts"], "the foot still has the shortcuts hint", d)


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
        gZenWorkspaces.activeWorkspaceElement.querySelector(".nyx-folders-header .nyx-new-folder-button").doCommand();
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
        document.getElementById("nyx-settings-button").doCommand();
        setTimeout(() => {
          const panel = document.getElementById("nyx-appearance-panel");
          const state = panel?.state;
          panel?.hidePopup();
          done({ state });
        }, 800);
    """)
    check(d["state"] in ("open", "showing"), "the Settings button didn't open Appearance", d)


def narrow_window(b, horizontal):
    """A narrow window keeps the address field usable: the last actions move into More tools,
    and navigation, Settings and the menu stay in the row."""
    b.js("window.resizeTo(800, 800)")
    time.sleep(1.5)
    try:
        d = b.js(READ_BAR, NAVIGATION, ACTIONS)
        fixed = d["navigation"] + d["actions"][-2:]
        for item in fixed:
            check(item and item["shown"], "a fixed button left the row in a narrow window", item)
        check(d["actions"][-1]["x"] + d["actions"][-1]["w"] <= d["win"], "the menu is off screen in a narrow window", d["actions"][-1])
        check(d["address"]["w"] > 150, "the address bar is too small in a narrow window", d["address"])
        # Firefox moves extensions' buttons into the Extensions panel, the rest into More tools.
        more = b.js("""
            const button = document.getElementById("nav-bar-overflow-button");
            const r = button.getBoundingClientRect();
            return { shown: r.width > 0, overflowed: [...document.getElementById("widget-overflow-list").children].map(c => c.id),
                     // Zen's site data panel has a list of the same id; Firefox's Extensions panel is the other.
                     extensions: [...document.querySelectorAll("#overflowed-extensions-list > *")].map(c => c.id) };
        """)
        hidden = [item["id"] for item in d["actions"][:-2] if not (item and item["shown"])]
        check(all(i in more["overflowed"] + more["extensions"] for i in hidden), "a button left the row without going into More tools", [hidden, more])
        check(not hidden or more["shown"], "buttons went into More tools but More tools isn't showing", more)
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
    """F1 opens the page that lists the shortcuts, also with Settings already open."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        gBrowser.selectedTab = gBrowser.addTab("about:preferences", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
        setTimeout(() => {
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", bubbles: true, cancelable: true }));
          setTimeout(() => done({ url: gBrowser.selectedBrowser.currentURI.spec }), 2000);
        }, 1500);
    """, timeout=15)
    check(d["url"] == "about:keyboard", "F1 didn't open the keyboard shortcuts", d)

def new_tab_page(b, horizontal):
    """Ctrl+T and the New tab button open the dashboard, as a real tab."""
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const read = () => ({ url: gBrowser.selectedBrowser.currentURI.spec, tabs: gBrowser.tabs.length, floating: gURLBar.hasAttribute("breakout-extend") && gURLBar.hasAttribute("zen-floating-urlbar") });
        const before = gBrowser.tabs.length;
        document.getElementById("cmd_newNavigatorTab").doCommand();
        setTimeout(() => {
          const key = read();
          gZenWorkspaces.activeWorkspaceElement.querySelector("#tabs-newtab-button").doCommand();
          setTimeout(() => done({ before, key, button: read() }), 1200);
        }, 1200);
    """, timeout=15)
    for way in ("key", "button"):
        check(d[way]["url"].endswith("/newtab.html"), f"opening a new tab by {way} didn't show the dashboard", d)
    check(d["button"]["tabs"] == d["before"] + 2, "new tabs weren't opened", d)


def foot_workspaces(b, horizontal):
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        (async () => {
          const first = gZenWorkspaces.activeWorkspace;
          const made = await gZenWorkspaces.createAndSaveWorkspace("Second", undefined, false, 0);
          await new Promise(r => setTimeout(r, 900));
          const spaces = () => [...document.querySelectorAll("#zen-workspaces-button > toolbarbutton")];
          const count = spaces().length;
          spaces()[1].doCommand();
          await new Promise(r => setTimeout(r, 900));
          const moved = gZenWorkspaces.activeWorkspace === made.uuid;
          const marked = spaces()[1].getAttribute("active") === "true";
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
        const row = Services.prefs.getBoolPref("zen.tabs.vertical")
          ? gZenWorkspaces.activeWorkspaceElement.querySelector(".zen-current-workspace-indicator")
          : document.getElementById("nyx-workspace-chip");
        row.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
        setTimeout(() => {
          const menu = document.getElementById("nyx-workspaces-menu");
          const items = menu ? [...menu.children].map(i => i.getAttribute("label") || i.localName) : [];
          const state = menu?.state;
          menu?.hidePopup();
          done({ state, items });
        }, 800);
    """)
    check(d["state"] in ("open", "showing"), "the workspace row didn't open its menu", d)
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
            passwords: await (async () => {
              const item = document.getElementById("nyx-passwords_design-nexus_github_io-browser-action");
              if (!item) {
                return null;
              }
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
    # The Extensions button has its own test (extensions_panel).
    for name in ("more", "downloads", "passwords"):
        if name == "passwords" and PASSWORDS not in ACTIONS:
            continue
        check(d[name] and d[name]["state"] in ("open", "showing"), f"the {name} button didn't open its panel", d)


TESTS = [new_tab_page, top_bar, narrow_window, page_fills_below_header, settings_button, address_bar, qr_dialog, page_buttons, extensions_panel, dropdowns, share_menu, page_menu, sidebar_header, settings_theme, collapse_button, hidden_mode, sidebar_parts, shortcuts_button, folder_add, foot_workspaces, workspace_menu, popups]


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
        with Browser(prefs, tokens=tokens, width=1700, height=1000, passwords=True) as b:
            if not b.passwords and PASSWORDS in ACTIONS:
                print("Nyx Passwords isn't installed here: its button isn't checked", flush=True)
                ACTIONS.remove(PASSWORDS)
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
