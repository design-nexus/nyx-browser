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

# The mockup's top bar, left to right, in Studio and Workbench. Ids are Firefox's or this
# browser's own. Capture, Assistant, Passwords, VPN and Open in start in More tools.
ACTIONS = [
    "nyx-share-button",
    "downloads-button",
    "unified-extensions-button",
    "nav-bar-overflow-button",
    "nyx-settings-button",
    "PanelUI-button",
]
IN_MORE_TOOLS = ["nyx-capture-button", "nyx-assistant-button", "nyx-passwords-button", "nyx-vpn-button", "nyx-openin-button"]
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
    more = b.js("return arguments[0].map(id => document.getElementById(id)?.closest('#widget-overflow-fixed-list') ? null : id).filter(Boolean)", IN_MORE_TOOLS)
    check(not more, "Browser's other actions aren't in More tools", more)
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
    """The Extensions button's panel is about the site in front (extpanel.js): a row for each
    extension that's on with what it may do here and a ⋯ menu, tiles for Get more and those that
    are off, and Browser's own Blocking, Passwords and VPN; uBlock Origin is Blocking. It opens
    even when every extension is pinned."""
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const shown = (sel, root) => [...root.querySelectorAll(sel)].filter(i => i.getBoundingClientRect().height > 0);
        const show = async ({ menu = false } = {}) => {
          const tabs = gBrowser.tabs.length;
          const button = document.getElementById("unified-extensions-button");
          button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, button: 0 }));
          await new Promise(r => setTimeout(r, 1500));
          const panel = document.getElementById("unified-extensions-panel");
          const out = {
            open: panel.state === "open" || panel.state === "showing",
            rows: shown(".nyx-ext-row", panel).map(r => r.querySelector("b")?.textContent.trim()),
            tiles: shown(".nyx-ext-tile", panel).map(i => i.querySelector("b")?.textContent.trim()),
            builtIn: shown(".nyx-ext-builtin", panel).map(i => i.querySelector("b")?.textContent.trim()),
            empty: shown(".nyx-ext-empty", panel).length > 0,
            page: gBrowser.tabs.length > tabs ? gBrowser.selectedBrowser.currentURI.spec : null,
          };
          if (menu && shown(".nyx-ext-more", panel)[0]) {
            shown(".nyx-ext-more", panel)[0].click();
            await new Promise(r => setTimeout(r, 800));
            const popup = document.getElementById("nyx-ext-menu");
            out.menu = [...popup.children].filter(i => i.localName === "menuitem" && !i.hidden).map(i => i.getAttribute("label"));
            popup.hidePopup();
            await new Promise(r => setTimeout(r, 300));
          }
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
          const after = await show({ menu: true });
          // Every extension pinned: the panel still opens, rather than the Extensions page.
          await gUnifiedExtensions.pinToToolbar("parity_nyx_test-browser-action", true);
          await new Promise(r => setTimeout(r, 500));
          const pinned = await show();
          await addon.uninstall();
          done({ before, after, pinned });
        })().catch(e => done({ error: String(e) }));
    """, timeout=60)
    check("error" not in d, "the extensions panel test threw", d)
    built_in = ["Blocking", "Passwords", "VPN"]
    before, after, pinned = d.get("before", {}), d.get("after", {}), d.get("pinned", {})
    check(before.get("open") and before["builtIn"] == built_in and before["empty"] and not before["rows"], "with no extensions the panel isn't Browser's own and Get extensions", d)
    check(after.get("open") and after["rows"] == ["Parity Extension"] and after["tiles"] == ["Get more"] and after["builtIn"] == built_in, "the panel doesn't have the added extension's row", d)
    check(after.get("menu", [])[:1] == ["Pin its button"] and {"Manage", "Remove…"} <= set(after.get("menu", [])), "an extension's ⋯ menu hasn't pin, Manage and Remove", d)
    check(pinned.get("open") and not pinned.get("page") and pinned["rows"] == ["Parity Extension"], "with every extension pinned the panel didn't open", d)


def vpn_place_connects(b, horizontal):
    """Picking a place or Fastest server in the VPN panel moves NordVPN there and turns the VPN on
    when it's off, for this workspace when it's set to No VPN (vpn.js)."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        (async () => {
          const { NyxVpn } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxVpn.sys.mjs");
          const saved = { ...NyxVpn };
          const calls = [];
          const ws = gZenWorkspaces.activeWorkspace;
          let workspaces = {};
          Object.assign(NyxVpn, {
            state: async () => ({ connections: [{ id: "n1", provider: "nordvpn", name: "NordVPN", host: "ch1.example", location: { code: "ch", name: "Switzerland", city: "Zurich" } }], active: null, workspaces, favorites: [] }),
            forBrowser: async () => null,
            countries: async () => [{ kind: "country", id: 1, code: "ch", name: "Switzerland", cities: [] }, { kind: "country", id: 2, code: "pt", name: "Portugal", cities: [] }],
            moveTo: async (id, place) => calls.push(["moveTo", id, place?.name ?? "fastest"]),
            setActive: async id => calls.push(["setActive", id]),
            setWorkspace: async (w, c) => calls.push(["setWorkspace", w === ws, c]),
          });
          const view = document.createXULElement("vbox");
          const body = document.createXULElement("vbox");
          body.className = "panel-subview-body";
          view.append(body);
          document.documentElement.append(view);
          const pick = async name => {
            await NyxVpnUI.show(view);
            await new Promise(r => setTimeout(r, 300));
            const row = [...body.querySelectorAll(".nyx-vpn-place")].find(r => r.textContent.includes(name));
            row.click();
            await new Promise(r => setTimeout(r, 300));
          };
          try {
            await pick("Portugal");
            const off = calls.splice(0);
            workspaces = { [ws]: "none" };
            await pick("Fastest");
            const none = calls.splice(0);
            done({ off, none });
          } finally {
            Object.assign(NyxVpn, saved);
            view.remove();
          }
        })().catch(e => done({ error: String(e) }));
    """, timeout=20)
    check("error" not in d, "the VPN test threw", d)
    check(d["off"] == [["moveTo", "n1", "Portugal"], ["setActive", "n1"]], "picking a place didn't connect there", d)
    check(d["none"] == [["moveTo", "n1", "fastest"], ["setWorkspace", True, "n1"]], "picking Fastest server in a No VPN workspace didn't connect it", d)


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
          out.downloads = panel(document.getElementById("downloadsPanel"), ".nyx-dl-head, .nyx-dl .row");
          await closeAll();
          gBrowser.selectedTab = gBrowser.addTab("https://example.invalid/page", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }); await pause(1500);
          document.getElementById("identity-icon-box").dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 })); await pause(1200);
          // The padlock opens Browser's Site card (site.js), drawn to the layouts' mockups.
          const card = document.querySelector("#nyx-site-card .nyx-sc");
          out.site = card && document.getElementById("nyx-site-card").state === "open" ? {
            width: Math.round(card.getBoundingClientRect().width),
            rows: [...card.querySelectorAll(".nyx-sc-perm")].filter(shown).slice(0, 4).map(e => Math.round(e.getBoundingClientRect().height)),
            font: getComputedStyle(card).fontSize,
          } : null;
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
    card = d["site"]
    check(card and card["width"] == 344 and card["rows"] and all(h == 34 for h in card["rows"]) and card["font"] == "13px", "the Site card isn't the mockup's", d)
    for name in ("appMenu", "history", "downloads"):
        p = d[name]
        check(p and p["width"] == 336, f"the {name} panel isn't 336 px wide", d)
        check(p["font"] == "13px", f"the {name} panel's text isn't 13 px", d)
    for name in ("appMenu", "history"):
        check(d[name]["rows"] and all(h == 32 for h in d[name]["rows"]), f"the {name} panel's rows aren't 32 px", d)
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
        title: view?.getAttribute("title"),
        page: view?.querySelector(".nyx-share-page b")?.textContent ?? null,
        rows: [
          ...[...(view?.querySelectorAll(".nyx-share-tile") ?? [])].map(r => ({ name: r.querySelector(".nyx-share-label").textContent, off: r.disabled, status: null, icon: r.querySelector("img").getAttribute("src") })),
          ...[...(view?.querySelectorAll(".nyx-share-device") ?? [])].map(r => ({ name: r.querySelector("b").textContent, off: r.disabled, status: r.querySelector("small").textContent, icon: r.querySelector("img").getAttribute("src") })),
        ],
        note: view?.querySelector(".nyx-share-note")?.textContent ?? null,
        more: !!view?.querySelector("#nyx-share-more"),
        copy: ["nyx-share-copy-link", "nyx-share-copy-clean"].map(id => { const b = view?.querySelector("#" + id); return b && !b.disabled && b.textContent.trim(); }),
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
        check([r["name"] for r in d["rows"]] == ["Copy", "Mail", "QR code", "Phone"], "the dropdown doesn't list Share's destinations", d)
        check(bool(d["page"]), "the dropdown doesn't show the page", d)
        check(d["copy"] == ["Copy link", "Clean link"], "the page's card hasn't Copy link and Clean link", d)
        phone = d["rows"][3]
        check(phone["off"] and phone["status"] == "Not connected", "an unavailable destination isn't greyed out with its reason", d)
        check(d["rows"][0]["icon"].endswith("/copy.svg") and d["rows"][1]["icon"].endswith("/mail.svg"), "the destinations don't have Browser's icons", d)
        picked = b.js_async(r"""
            const done = arguments[arguments.length - 1];
            const row = [...document.querySelectorAll("#PanelUI-nyx-share .nyx-share-tile")].find(r => r.querySelector(".nyx-share-label").textContent === "Mail");
            row.click();
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
    """Firefox's bookmarks and history sidebars are the Library's sections (library.js), and
    Bookmarks doesn't claim Browser's Ctrl+B."""
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        SidebarController.show("viewBookmarksSidebar").then(() => setTimeout(() => {
          const out = {
            page: gBrowser.currentURI.spec,
            sidebar: SidebarController.isOpen,
            key: ShortcutUtils.prettifyShortcut(document.getElementById("viewBookmarksSidebarKb")),
          };
          gBrowser.removeTab(gBrowser.selectedTab);
          done(out);
        }, 1500));
    """, timeout=15)
    check(d["page"] == "about:library#bookmarks" and not d["sidebar"], "the bookmarks sidebar isn't the Library's Bookmarks", d)
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
          railSpace: box(document.querySelector("#nyx-rail .nyx-rail-space[selected]")),
          railLabel: document.querySelector("#nyx-rail .nyx-rail-space[selected]")?.getAttribute("label"),
          railSwitcher: box(document.getElementById("nyx-rail-switcher")),
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
        # Workbench's rail has the workspaces and the switcher, so the row has no chip.
        check(not visible(d["chip"]), "the tab row still has the workspace chip beside the rail", d["chip"])
        check(visible(d["railSpace"]) and d["railLabel"], "the rail's workspace has no initial", d)
        check(visible(d["railSwitcher"]) and visible(d["rowSearch"]), "the rail has no switcher, or the row no search", d)
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
        return { top: page.top, bottom: page.bottom, h: innerHeight, strip: gNavToolbox.getBoundingClientRect().bottom, layout: document.documentElement.getAttribute("nyx-layout") };
    """)
    # Workbench: the tab bar and the address bar; Focus: no top bar at all.
    limit = {"workbench": 90, "focus": 12}.get(d["layout"], 54)
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
          setTimeout(() => {
            const doc = gBrowser.selectedBrowser.contentDocument;
            const rows = [...doc.querySelectorAll("#nyxKeysGroups .nyx-key-row")];
            done({ url: gBrowser.selectedBrowser.currentURI.spec, rows: rows.length, gestures: [...doc.querySelectorAll('[data-category="paneNyxGestures"]:not(.nyx-keys-part)')].filter(e => e.getBoundingClientRect().height > 0).length });
          }, 2500);
        }, 1500);
    """, timeout=15)
    check(d["url"].startswith("about:preferences#nyxGestures-keys") and d["rows"] > 20, "F1 didn't open Settings' keyboard shortcuts with every shortcut", d)
    check(d["gestures"] == 0, "Gestures' own groups show beside its keyboard shortcuts", d)

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
        // Passwords and VPN start in More tools: their views open in its panel.
        const fromMore = async (buttonId, viewId) => {
          // More tools opens on mouse down; a click after it would close it again.
          const more = document.getElementById("nav-bar-overflow-button");
          more.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window, button: 0 }));
          await new Promise(r => setTimeout(r, 900));
          document.getElementById(buttonId).click();
          await new Promise(r => setTimeout(r, 1200));
          const panel = document.getElementById("widget-overflow");
          const view = document.getElementById(viewId);
          const state = panel?.state;
          const shown = !!view?.hasAttribute("current") || !!view?.closest("panelmultiview")?.querySelector(`#${viewId}[visible]`);
          const radius = panel ? getComputedStyle(panel).getPropertyValue("--arrowpanel-menuitem-border-radius").trim() : "";
          panel?.hidePopup?.();
          await new Promise(r => setTimeout(r, 300));
          return { state: shown ? state : `view not shown (${state})`, radius };
        };
        (async () => {
          done({
            more: await open("PanelUI-menu-button", "appMenu-popup"),
            downloads: await open("downloads-button", "downloadsPanel"),
            passwords: await fromMore("nyx-passwords-button", "PanelUI-nyx-passwords"),
            vpn: await fromMore("nyx-vpn-button", "PanelUI-nyx-vpn"),
          });
        })().catch(e => done({ error: String(e) }));
    """, timeout=30)
    check("error" not in d, "opening a panel threw", d)
    # The Extensions button has its own test (extensions_panel).
    for name in ("more", "downloads", "passwords", "vpn"):
        check(d[name] and d[name]["state"] in ("open", "showing"), f"the {name} button didn't open its panel", d)


def focus_sidebar(b, horizontal):
    """Focus: no top bar; navigation and the address head the sidebar, its foot has Downloads,
    Extensions and the menu, and the page runs the window's height."""
    d = b.js(r"""
        const box = id => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { id, x: r.x, y: r.y, w: r.width, h: r.height, side: !!e.closest("#navigator-toolbox"), foot: !!e.closest("#zen-sidebar-foot-buttons") }; };
        return { nav: ["back-button", "forward-button", "stop-reload-button"].map(box), address: box("urlbar-container"),
          foot: ["downloads-button", "unified-extensions-button", "PanelUI-button"].map(box), side: gNavToolbox.getBoundingClientRect().width,
          settings: box("nyx-settings-button") };
    """)
    for item in d["nav"] + [d["address"]]:
        check(item and item["side"] and item["w"] > 0, "navigation and the address aren't in the sidebar", item)
    check(all(n["y"] < d["address"]["y"] for n in d["nav"]), "navigation isn't above the address", d)
    check(d["address"]["w"] > d["side"] - 40, "the address doesn't span the sidebar", d)
    for item in d["foot"]:
        check(item and item["foot"] and item["w"] > 0, "the sidebar's foot is missing a button", item)
    check(not d["settings"]["w"], "Focus shows a Settings button", d["settings"])


def settings_pages(b, horizontal):
    """Settings is Browser's own panes alone, in three groups, and Find finds across them."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          openPreferences("privacy-permissions");
          await pause(2500);
          const w = gBrowser.selectedBrowser.contentWindow, doc = w.document;
          const shown = e => e.getBoundingClientRect().height > 0;
          const nav = [...doc.querySelectorAll("#categories > moz-page-nav-button")].filter(shown).map(e => e.id);
          const groups = [...doc.querySelectorAll("#categories > .nyx-nav-heading")].filter(shown).map(e => e.textContent.trim());
          const hash = w.location.hash;
          const find = doc.getElementById("nyxFind");
          find.value = "cookies";
          find.dispatchEvent(new w.Event("input"));
          await pause(800);
          const head = doc.getElementById("nyxFindHead")?.textContent ?? "";
          const found = [...doc.querySelectorAll(".nyx-row:not(.nyx-unfound)")].filter(shown).length;
          gBrowser.removeTab(gBrowser.selectedTab);
          done({ nav, groups, hash, head, found });
        })().catch(e => done({ error: String(e) }));
    """, timeout=30)
    check("error" not in d, "opening Settings threw", d)
    check(len(d["nav"]) == 18 and all(i.startswith("category-nyx-") for i in d["nav"]) and d["nav"][-1] == "category-nyx-about", "Settings' navigation isn't Browser's 18 sections, About last", d)
    check({"category-nyx-styles", "category-nyx-scripts", "category-nyx-youtube"} <= set(d["nav"]), "Site styles, Scripts or YouTube is missing from Settings", d)
    check(d["groups"] == ["Browser", "Privacy", "Tools"], "Settings' groups aren't Browser, Privacy and Tools", d)
    check(d["hash"].startswith("#nyxPermissions"), "Firefox's privacy-permissions link doesn't land on Permissions", d)
    check("cookies" in d["head"] and d["found"] >= 2, "Find in Settings doesn't find cookies", d)


def library_page(b, horizontal):
    """Every way to Firefox's Library opens Browser's Library page, in one tab, at its section."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          const pages = [];
          for (const run of [() => PlacesCommandHook.showPlacesOrganizer("History"), () => PlacesCommandHook.showPlacesOrganizer("AllBookmarks"), () => BrowserCommands.downloadsUI()]) {
            run();
            await pause(1500);
            pages.push(gBrowser.currentURI.spec);
          }
          const tabs = gBrowser.tabs.filter(t => t.linkedBrowser.currentURI.spec.startsWith("about:library")).length;
          const nav = [...gBrowser.selectedBrowser.contentDocument.querySelectorAll(".nav-item")].map(e => e.dataset.section);
          for (const t of gBrowser.tabs.filter(t => t.linkedBrowser.currentURI.spec.startsWith("about:library"))) gBrowser.removeTab(t);
          done({ pages, tabs, nav });
        })().catch(e => done({ error: String(e) }));
    """, timeout=30)
    check(d.get("pages") == ["about:library#history", "about:library#bookmarks", "about:library#downloads"], "the Library's ways in don't open its sections", d)
    check(d["tabs"] == 1, "the Library opened more than one tab", d)
    check(d["nav"] == ["history", "bookmarks", "downloads", "reading"], "the Library's sections aren't History, Bookmarks, Downloads and Reading list", d)


def library_bookmarks(b, horizontal):
    """The Library's Bookmarks shows a large tree at once, and its folders are in Browser's accent."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          const folders = [];
          // About as many as a real collection: 440 folders, 12,000 bookmarks.
          for (let i = 0; i < 40; i++) {
            const sub = [];
            for (let j = 0; j < 10; j++) {
              sub.push({ type: PlacesUtils.bookmarks.TYPE_FOLDER, title: `Folder ${i}.${j}`, children: Array.from({ length: 28 }, (_, k) => ({ url: `https://example.com/${i}/${j}/${k}`, title: `Page ${i}.${j}.${k}` })) });
            }
            folders.push({ type: PlacesUtils.bookmarks.TYPE_FOLDER, title: `Folder ${i}`, children: [...sub, ...Array.from({ length: 10 }, (_, k) => ({ url: `https://example.com/${i}/${k}`, title: `Page ${i}.${k}` }))] });
          }
          const inserted = await PlacesUtils.bookmarks.insertTree({ guid: PlacesUtils.bookmarks.toolbarGuid, children: folders });
          const start = Date.now();
          const tab = gBrowser.addTab("about:library#bookmarks", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
          gBrowser.selectedTab = tab;
          let ms = null;
          while (Date.now() - start < 15000) {
            const doc = tab.linkedBrowser.contentDocument;
            if (doc?.querySelectorAll(".tree .tr").length > 440) {
              ms = Date.now() - start;
              break;
            }
            await pause(20);
          }
          const doc = tab.linkedBrowser.contentDocument;
          const win = doc.defaultView;
          const accent = win.getComputedStyle(doc.documentElement).getPropertyValue("--nyx-accent").trim();
          const folderIcon = win.getComputedStyle(doc.querySelector(".tree .tr img")).fill;
          const probe = doc.createElement("span");
          probe.style.color = accent;
          doc.body.append(probe);
          const accentRgb = win.getComputedStyle(probe).color;
          probe.remove();
          gBrowser.removeTab(tab);
          await PlacesUtils.bookmarks.eraseEverything();
          done({ ms, folderIcon, accentRgb, rows: inserted.length });
        })().catch(e => done({ error: String(e) }));
    """, timeout=120)
    check("error" not in d and d["ms"] is not None and d["ms"] < 800, "the Library's Bookmarks took too long to show a large tree", d)
    check(d.get("folderIcon") == d.get("accentRgb"), "the Library's folders aren't in Browser's accent", d)


def extensions_page(b, horizontal):
    """Firefox's add-ons manager links open Browser's Extensions page, with what's built in."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        BrowserAddonUI.openAddonsMgr("addons://list/extension");
        setTimeout(() => {
          const doc = gBrowser.selectedBrowser.contentDocument;
          const out = { page: gBrowser.currentURI.spec, cards: [...doc.querySelectorAll(".xcard b")].map(e => e.textContent.trim()) };
          gBrowser.removeTab(gBrowser.selectedTab);
          done(out);
        }, 2500);
    """, timeout=20)
    check(d["page"] == "about:extensions#extensions", "the add-ons manager link doesn't open the Extensions page", d)
    check(d["cards"] == ["Content blocking", "Passwords", "VPN"], "the Extensions page doesn't show what's built in", d)


def themes_page(b, horizontal):
    """Extensions › Themes is the Nyx themes, Follow system first, and Browser's accent; picking
    one saves Browser's own choice, which every page takes."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          BrowserAddonUI.openAddonsMgr("addons://list/theme");
          await pause(3000);
          const doc = gBrowser.selectedBrowser.contentDocument;
          const cards = [...doc.querySelectorAll(".tcard")];
          const out = { url: gBrowser.currentURI.spec, follow: !!doc.querySelector(".tfollow[selected]"), names: cards.map(c => c.querySelector(".tn b").textContent), accents: doc.querySelectorAll(".acc").length };
          cards.find(c => c.textContent.includes("Nyx Light"))?.click();
          await pause(800);
          doc.querySelector('.acc[data-l10n-id="nyx-accent-green"]')?.click();
          await pause(2500);
          const { NyxTheme } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxTheme.sys.mjs");
          out.saved = await NyxTheme.choices();
          out.picked = !!gBrowser.selectedBrowser.contentDocument.querySelector(".tcard[selected]")?.textContent.includes("Nyx Light");
          await NyxTheme.choose({ theme: "follow", accent: "" });
          gBrowser.removeTab(gBrowser.selectedTab);
          done(out);
        })().catch(e => done({ error: String(e) }));
    """, timeout=40)
    check("error" not in d and d["url"] == "about:extensions#themes", "the themes link doesn't open Extensions › Themes", d)
    check(d["follow"] and "Nyx Dark" in d["names"] and "Nyx Light" in d["names"] and len(d["names"]) >= 10, "Themes doesn't list the Nyx themes after Follow system", d)
    check(d["accents"] >= 10, "Themes has no accent swatches", d)
    check(d["saved"].get("theme") == "nyx-light" and d["saved"].get("accent") == "green" and d["picked"], "picking a theme and an accent wasn't saved", d)


def extensions_more(b, horizontal):
    """An extension's row has a menu with Remove; Shortcuts, an extension's options and Firefox's
    about:addons are Browser's page; nothing opens Firefox's add-ons manager."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          const dir = Services.dirsvc.get("TmpD", Ci.nsIFile);
          dir.append("nyx-parity-more");
          await IOUtils.makeDirectory(dir.path, { ignoreExisting: true });
          await IOUtils.writeUTF8(PathUtils.join(dir.path, "manifest.json"), JSON.stringify({
            manifest_version: 2, name: "Parity Options", version: "1.0", browser_specific_settings: { gecko: { id: "options@nyx.test" } },
            browser_action: { default_title: "Parity" }, options_ui: { page: "options.html" }, optional_permissions: ["downloads"],
            commands: { toggle: { suggested_key: { default: "Alt+Shift+9" }, description: "Toggle it" } },
          }));
          await IOUtils.writeUTF8(PathUtils.join(dir.path, "options.html"), "<p id=o>Options here</p>");
          const addon = await AddonManager.installTemporaryAddon(dir);
          await pause(1000);
          const out = {};
          BrowserAddonUI.openAddonsMgr("addons://list/extension");
          await pause(2500);
          let doc = gBrowser.selectedBrowser.contentDocument;
          doc.querySelector(".row .ibtn.more")?.click();
          await pause(500);
          out.menu = [...doc.querySelectorAll(".menu .mi span")].map(s => s.textContent);
          doc.body.click();
          BrowserAddonUI.openAddonsMgr("addons://shortcuts/shortcuts");
          await pause(2000);
          doc = gBrowser.selectedBrowser.contentDocument;
          out.shortcuts = { url: gBrowser.currentURI.spec, rows: [...doc.querySelectorAll(".krow b")].map(b => b.textContent) };
          BrowserAddonUI.openAddonsMgr(`addons://detail/${encodeURIComponent(addon.id)}/preferences`);
          await pause(3000);
          doc = gBrowser.selectedBrowser.contentDocument;
          out.options = { url: gBrowser.currentURI.spec, tab: doc.querySelector('.tabs [aria-selected="true"]')?.textContent, browser: !!doc.querySelector(".xopts browser") };
          gBrowser.selectedBrowser.contentWindow.location.hash = `detail/${encodeURIComponent(addon.id)}/permissions`;
          await pause(1500);
          out.optional = doc.querySelectorAll(".cols .sw").length;
          gBrowser.selectedTab = gBrowser.addTab("about:addons", { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
          await pause(2000);
          out.addons = !!gBrowser.selectedBrowser.contentDocument.querySelector('.nav-item[data-section="themes"]');
          out.firefox = gBrowser.tabs.some(t => t.linkedBrowser.currentURI.spec.startsWith("about:addons") && t.linkedBrowser.contentDocument?.querySelector("addon-list, categories-box"));
          for (const t of gBrowser.tabs.filter(t => /^about:(extensions|addons)/.test(t.linkedBrowser.currentURI.spec))) gBrowser.removeTab(t);
          await addon.uninstall();
          done(out);
        })().catch(e => done({ error: String(e) }));
    """, timeout=60)
    check("error" not in d, "the Extensions page test threw", d)
    check({"Remove…", "Permissions and details", "Its own settings"} <= set(d.get("menu", [])), "an extension's row menu hasn't Remove, its options and its details", d)
    check(d["shortcuts"]["url"] == "about:extensions#shortcuts" and "Toggle it" in d["shortcuts"]["rows"], "Shortcuts isn't a section of Browser's Extensions page", d)
    check(d["options"]["tab"] == "Its options" and d["options"]["browser"], "an extension's options don't open inside its page", d)
    check(d["optional"] >= 1, "an extension's optional permissions have no switches", d)
    check(d["addons"] and not d["firefox"], "about:addons is still Firefox's add-ons manager", d)


def about_page(b, horizontal):
    """About Browser is Settings' last page, with its version; Help › About opens it."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          openAboutDialog();
          await pause(2500);
          const doc = gBrowser.selectedBrowser.contentDocument;
          const out = { url: gBrowser.currentURI.spec, version: doc.getElementById("nyxAboutVersion")?.textContent ?? "", windows: Services.wm.getEnumerator("Browser:About").hasMoreElements() };
          gBrowser.removeTab(gBrowser.selectedTab);
          done(out);
        })().catch(e => done({ error: String(e) }));
    """, timeout=20)
    check(d.get("url", "").startswith("about:preferences#nyxAbout") and not d["windows"], "About doesn't open Settings' About page", d)
    check(d["version"].startswith("Version ") and "Firefox" not in d["version"], "About's version line is missing or names Firefox", d)


def containers_settings(b, horizontal):
    """Manage Containers lands on Layout & tabs' Containers, which lists and makes containers."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          openPreferences("paneContainers");
          await pause(2500);
          const doc = gBrowser.selectedBrowser.contentDocument;
          const rows = () => doc.querySelectorAll("#nyxContainersList > .nyx-list-row").length;
          const out = { hash: gBrowser.selectedBrowser.contentWindow.location.hash, before: rows() };
          doc.getElementById("nyxContainersNew").doCommand();
          await pause(800);
          out.after = rows();
          out.editing = !!doc.querySelector(".nyx-container-editor");
          const { ContextualIdentityService } = ChromeUtils.importESModule("resource://gre/modules/ContextualIdentityService.sys.mjs");
          const made = ContextualIdentityService.getPublicIdentities().at(-1);
          ContextualIdentityService.remove(made.userContextId);
          gBrowser.removeTab(gBrowser.selectedTab);
          done(out);
        })().catch(e => done({ error: String(e) }));
    """, timeout=20)
    check(d.get("hash", "").startswith("#nyxTabs") and d["before"] >= 4, "Manage Containers doesn't show the containers", d)
    check(d["after"] == d["before"] + 1 and d["editing"], "New container doesn't make one and open it", d)


def library_import(b, horizontal):
    """Bookmarks has Import and back up: from another browser or a file, back up, export, put back."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          PlacesCommandHook.showPlacesOrganizer("AllBookmarks");
          await pause(2000);
          const doc = gBrowser.selectedBrowser.contentDocument;
          [...doc.querySelectorAll("#actions .pbtn")].at(-1).click();
          await pause(800);
          const items = [...doc.querySelectorAll(".menu .mi span")].map(s => s.textContent);
          gBrowser.removeTab(gBrowser.selectedTab);
          done({ items });
        })().catch(e => done({ error: String(e) }));
    """, timeout=20)
    want = {"From another browser…", "From a file (HTML)…", "Back up now…", "Export as a file (HTML)…", "From a file…"}
    check(want <= set(d.get("items", [])), "Bookmarks' Import and back up menu is missing something", d)


def help_menu(b, horizontal):
    """Help has Browser's keyboard shortcuts and About, without Firefox's troubleshooting."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          PanelUI.show();
          await pause(800);
          PanelUI.showSubView("PanelUI-helpView", document.getElementById("appMenu-help-button2"));
          await pause(1000);
          const shown = [...document.querySelectorAll("#PanelUI-helpItems > toolbarbutton")].filter(e => e.getBoundingClientRect().height > 0).map(e => e.id);
          PanelUI.hide();
          done({ shown, processes: document.getElementById("View:AboutProcesses")?.getAttribute("disabled") });
        })().catch(e => done({ error: String(e) }));
    """, timeout=20)
    shown = d.get("shown", [])
    check(shown[:1] == ["nyx-help-keys"] and "appMenu_aboutName" in shown, "Help doesn't start with Keyboard shortcuts, or has no About", d)
    check(not {"appMenu_helpSafeMode", "appMenu_troubleShooting", "appMenu_menu_HelpPopup_reportPhishingtoolmenu"} & set(shown), "Help still has Firefox's troubleshooting or report items", d)
    check(d["processes"] == "true", "Shift+Esc still opens Firefox's task manager", d)


def tab_menu(b, horizontal):
    """The tab menu is the mockups': its rows on top, then its items, every one labelled."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const row = document.querySelector(".nyx-tl-tab[selected]");
        const r = row.getBoundingClientRect();
        row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.x + 40, clientY: r.y + 10, screenX: r.x + 40, screenY: r.y + 10 }));
        setTimeout(() => {
          const menu = document.getElementById("tabContextMenu");
          const items = [...menu.children].filter(e => !e.hidden && e.getBoundingClientRect().height > 0 && /^(menu|menuitem)$/.test(e.localName));
          const out = { ids: items.map(e => e.id), unlabelled: items.filter(e => !e.getAttribute("label")).map(e => e.id || e.getAttribute("data-l10n-id")) };
          menu.hidePopup();
          done(out);
        }, 1200);
    """, timeout=15)
    check(not d["unlabelled"], "tab menu items have no label", d)
    check(d["ids"][:2] == ["nyx-tab-new-below", "context_toggleMuteTab"] and "context_undoCloseTab" in d["ids"], "the tab menu isn't in the mockups' order", d)
    check("context_sendTabToDevice" not in d["ids"] and "context_selectAllTabs" not in d["ids"], "the tab menu still has Firefox's extra items", d)


def address_dropdown(b, horizontal):
    """The address dropdown has the engine chip, the foot and Browser's group names."""
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        gURLBar.focus();
        gURLBar.search("close");
        setTimeout(() => {
          const out = {
            chip: !!document.getElementById("nyx-engine-chip")?.getBoundingClientRect().width,
            foot: !!document.getElementById("nyx-urlbar-foot")?.getBoundingClientRect().height,
            labels: [...gURLBar.view.panel.querySelectorAll(".urlbarView-row[label]")].map(r => r.getAttribute("label")),
          };
          gURLBar.view.close();
          gURLBar.blur();
          done(out);
        }, 2000);
    """, timeout=15)
    check(d["chip"] and d["foot"], "the address dropdown has no engine chip or foot", d)
    check("Commands" in d["labels"] and not any("Suggest" in label for label in d["labels"]), "the dropdown's groups aren't Browser's", d)


def sitekit_settings(b, horizontal):
    """Site styles, Scripts and YouTube: lists, Design 2.0 switches, SSS import on Selection."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          const { NyxSiteKit } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxSiteKit.sys.mjs");
          const { parseUserStyle, parseUserScript, sectionMatches, scriptMatches } = ChromeUtils.importESModule("resource://nyx/actors/NyxSiteCode.sys.mjs");
          await NyxSiteKit.init();
          const before = await NyxSiteKit.styles();
          const style = await NyxSiteKit.addStyle(`/* ==UserStyle==
@name Parity wide
@preprocessor default
==/UserStyle== */

@-moz-document domain("example.com") {
  body { margin: 0; }
}
`);
          const script = await NyxSiteKit.addScript(`// ==UserScript==
// @name Parity script
// @match https://example.com/*
// @grant none
// ==/UserScript==
(function () { "use strict"; })();
`);
          const after = await NyxSiteKit.styles();
          const scripts = await NyxSiteKit.scripts();
          const meta = parseUserStyle(`/* ==UserStyle==
@name Range
@var range width "Width" [100, 50, 200, 10, "px"]
==/UserStyle== */`);
          openPreferences("paneNyxStyles");
          await pause(2500);
          const doc = gBrowser.selectedBrowser.contentDocument;
          const switches = [...doc.querySelectorAll('#nyxStylesList checkbox.nyx-switch')].length;
          const builtin = [...doc.querySelectorAll('#nyxStylesBuiltin .nyx-row')].length;
          openPreferences("paneNyxYouTube");
          await pause(1500);
          const ytSwitches = [...doc.querySelectorAll('[data-category="paneNyxYouTube"] checkbox.nyx-switch')].length;
          openPreferences("paneNyxSelection");
          await pause(1200);
          const sss = !!doc.getElementById("nyxSelectionImport");
          await NyxSiteKit.removeStyle(style.id);
          await NyxSiteKit.removeScript(script.id);
          gBrowser.removeTab(gBrowser.selectedTab);
          done({
            builtinBefore: before.builtin.length,
            mineGrew: after.mine.length === before.mine.length + 1,
            scripted: scripts.some(s => s.id === script.id),
            range: meta?.vars?.width?.type === "range",
            switches, builtin, ytSwitches, sss,
            matches: sectionMatches({ domains: ["example.com"], urls: [], urlPrefixes: [], regexps: [] }, "https://www.example.com/x")
              && scriptMatches({ match: ["https://example.com/*"], include: [], exclude: [] }, "https://example.com/a"),
          });
        })().catch(e => done({ error: String(e) }));
    """, timeout=40)
    check("error" not in d, "sitekit settings threw", d)
    check(d["builtinBefore"] >= 10 and d["mineGrew"] and d["scripted"], "styles or scripts don't store", d)
    check(d["range"] and d["matches"], "UserCSS range vars or matching failed", d)
    check(d["switches"] >= 1 and d["builtin"] >= 8 and d["ytSwitches"] >= 5 and d["sss"], "Site styles / YouTube / SSS UI is incomplete", d)


def sitekit_install_card(b, horizontal):
    """Opening a .user.js page shows the install card; Install adds the script."""
    if horizontal:
        return
    d = b.js_async(r"""
        const done = arguments[arguments.length - 1];
        const pause = ms => new Promise(r => setTimeout(r, ms));
        (async () => {
          const { NyxSiteKit } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxSiteKit.sys.mjs");
          const { INSTALL_TOPIC } = ChromeUtils.importESModule("resource://nyx/actors/NyxSiteParent.sys.mjs");
          const before = (await NyxSiteKit.scripts()).length;
          const text = `// ==UserScript==
// @name Install card parity
// @match https://maps.example/*
// @grant none
// ==/UserScript==
`;
          Services.obs.notifyObservers(gBrowser.selectedBrowser, INSTALL_TOPIC, JSON.stringify({ kind: "script", url: "https://maps.example/x.user.js", text }));
          await pause(800);
          const panel = document.getElementById("nyx-install-card");
          const open = panel && (panel.state === "open" || panel.state === "showing");
          const btn = panel?.querySelector(".nyx-ic-btn.primary");
          btn?.click();
          await pause(800);
          panel?.hidePopup();
          const after = await NyxSiteKit.scripts();
          const made = after.find(s => s.meta.name === "Install card parity");
          if (made) await NyxSiteKit.removeScript(made.id);
          done({ open, grew: after.length === before + 1, switch: !!panel?.querySelector("checkbox.nyx-switch") });
        })().catch(e => done({ error: String(e) }));
    """, timeout=20)
    check("error" not in d, "install card threw", d)
    check(d["open"] and d["grew"], "the install card didn't open or install", d)


# Zen's address in the sidebar keeps its page actions for when it's focused, so address_bar is
# for the layouts with a top bar.
FOCUS_TESTS = {"focus_sidebar", "page_fills_below_header", "new_tab_page", "qr_dialog", "page_buttons", "popups"}

TESTS = [focus_sidebar, new_tab_page, top_bar, narrow_window, page_fills_below_header, settings_button, address_bar, qr_dialog, page_buttons, extensions_panel, vpn_place_connects, dropdowns, share_menu, page_menu, sidebar_header, settings_theme, collapse_button, hidden_mode, sidebar_parts, shortcuts_button, folder_add, foot_workspaces, workspace_menu, popups, settings_pages, library_page, library_bookmarks, library_import, extensions_page, extensions_more, themes_page, about_page, containers_settings, help_menu, tab_menu, address_dropdown, sitekit_settings, sitekit_install_card]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots")
    ap.add_argument("--only")
    opts = ap.parse_args()
    results = []
    tokens = look.tokens("catppuccin-mocha")
    for name, horizontal, prefs in (
        ("expanded", False, {"nyx.layout": "studio", "nyx.sidebar.mode": "expanded"}),
        ("rail", False, {"nyx.layout": "studio", "nyx.sidebar.mode": "compact"}),
        ("focus", False, {"nyx.layout": "focus", "nyx.sidebar.mode": "expanded"}),
        ("horizontal", True, {"nyx.layout": "workbench"}),
    ):
        with Browser(prefs, tokens=tokens, width=1700, height=1000, passwords=True) as b:
            b.js("window.resizeTo(1500, 900)")
            time.sleep(2.5)
            if opts.shots:
                b.screenshot(Path(opts.shots) / f"parity-{name}.png")
            for test in TESTS:
                if opts.only and opts.only != test.__name__:
                    continue
                if name == "rail" and test in (collapse_button, hidden_mode, sidebar_parts, shortcuts_button, folder_add, foot_workspaces):
                    continue
                if (test is focus_sidebar and name != "focus") or (name == "focus" and test.__name__ not in FOCUS_TESTS):
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
