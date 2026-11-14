#!/usr/bin/env python3
"""Browser's own features: tab behaviours, Open in, selection search, video downloads, the VPN,
content blocking's shield and Quick Commands. Pages come from a local server; the native host is
the harness's stand-in (marionette.py), the VPN goes through a local proxy here, and uBlock Origin
blocks with the lists it ships with, so nothing reaches the internet.

    tests/features.py
"""

import base64
import functools
import http.server
import json
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from marionette import Browser  # noqa: E402

failures = []
proxied = []

PAGES = {
    "text.html": "<!doctype html><meta charset=utf-8><body style='font:16px sans-serif;padding:60px'><p id=p>Cedar Spring is the only reliable water.</p>",
    "field.html": "<!doctype html><meta charset=utf-8><body style='padding:60px'><input id=f>",
    "watch.html": "<!doctype html><meta charset=utf-8><title>Ridge loop</title><video src='clip.webm' muted></video>",
    "ads.html": "<!doctype html><meta charset=utf-8><title>Ads</title>"
    "<script async src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'></script>"
    "<script src='https://www.google-analytics.com/analytics.js'></script>"
    "<img src='https://ad.doubleclick.net/ddm/ad/pixel.gif'>",
}


def check(ok, message, detail=None):
    print(("ok  " if ok else "FAIL") + f"  {message}" + ("" if ok or detail is None else f": {detail}"))
    if not ok:
        failures.append(message)


class Site(http.server.SimpleHTTPRequestHandler):
    """The test pages, and a proxy with a login (absolute addresses) for the VPN."""

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.startswith("http://"):
            proxied.append((self.path, self.headers.get("Proxy-Authorization", "")))
            if self.headers.get("Proxy-Authorization") != "Basic " + base64.b64encode(b"user:pass").decode():
                self.send_response(407)
                self.send_header("Proxy-Authenticate", 'Basic realm="test"')
                self.end_headers()
                return
            body = b"<h1 id=via>via the VPN</h1>"
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/nord/v1/"):
            body = json.dumps(nord_api(self.path[len("/nord/v1"):])).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


# A stand-in for NordVPN's server list: a few countries and cities, and a proxy in each place but
# Santiago.
NORD_COUNTRIES = [
    {"id": 228, "code": "US", "name": "United States", "cities": [{"id": 1, "name": "Atlanta"}, {"id": 2, "name": "San Francisco"}]},
    {"id": 43, "code": "CL", "name": "Chile", "cities": [{"id": 3, "name": "Santiago"}]},
    {"id": 208, "code": "SE", "name": "Sweden", "cities": [{"id": 4, "name": "Stockholm"}]},
]


def nord_api(path):
    if path.startswith("/servers/countries"):
        return NORD_COUNTRIES
    query = dict(p.split("=", 1) for p in path.split("?", 1)[-1].split("&") if "=" in p)
    city = query.get("filters[country_city_id]") or query.get("filters%5Bcountry_city_id%5D")
    country = query.get("filters[country_id]") or query.get("filters%5Bcountry_id%5D")
    for c in NORD_COUNTRIES:
        for town in c["cities"]:
            if (city and int(city) == town["id"]) or (not city and country and int(country) == c["id"]) or (not city and not country and c["code"] == "SE"):
                if town["name"] == "Santiago":
                    return []
                n = town["id"]
                return [{"hostname": f"{c['code'].lower()}{n}.nordvpn.test", "name": f"{c['name']} #{n}",
                         "locations": [{"country": {"code": c["code"], "name": c["name"], "city": {"name": town["name"]}}}]}]
    return []


def pointer(b, x, y, clicks=1):
    steps = [{"type": "pointerMove", "x": int(x), "y": int(y), "origin": "viewport"}]
    for _ in range(clicks):
        steps += [{"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]
    b._call("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"}, "actions": steps}]})
    b._call("WebDriver:ReleaseActions", {})


def navigate(b, url):
    b.call("Marionette:SetContext", {"value": "content"})
    try:
        b.call("WebDriver:Navigate", {"url": url})
    except Exception:  # noqa: BLE001 - an error page is an answer too
        pass
    b.call("Marionette:SetContext", {"value": "chrome"})


def tabs(b, base):
    d = b.js_async(r"""
      const done = arguments[arguments.length - 1];
      (async () => {
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const open = url => gBrowser.addTrustedTab(url, { inBackground: false });
        const a = open("about:blank#a"), m = open("about:blank#b"), c = open("about:blank#c");
        await wait(300);
        Services.prefs.setBoolPref("nyx.tabs.select-left-on-close", true);
        Services.prefs.setBoolPref("zen.tabs.select-recently-used-on-close", false);
        Services.prefs.setBoolPref("browser.tabs.selectOwnerOnClose", false);
        gBrowser.selectedTab = m;
        gBrowser.removeTab(m);
        await wait(300);
        const left = gBrowser.selectedTab === a;
        Services.prefs.setStringPref("nyx.tabs.double-click", "pin");
        Services.prefs.setBoolPref("zen.tabs.rename-tabs", false);
        c.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
        await wait(300);
        const pinned = c.pinned;
        gBrowser.unpinTab(c);
        for (const pref of ["nyx.tabs.select-left-on-close", "zen.tabs.select-recently-used-on-close", "browser.tabs.selectOwnerOnClose", "nyx.tabs.double-click", "zen.tabs.rename-tabs"]) Services.prefs.clearUserPref(pref);
        Services.prefs.setStringPref("nyx.tabs.close-buttons", "always");
        const attr = document.documentElement.getAttribute("nyx-tab-close");
        Services.prefs.clearUserPref("nyx.tabs.close-buttons");
        for (const t of [a, c]) gBrowser.removeTab(t);
        done({ left, pinned, attr });
      })().catch(e => done({ error: String(e) }));
    """, timeout=30)
    check(d.get("left"), "closing a tab can go to the one on its left", d)
    check(d.get("pinned"), "a double click can pin a tab", d)
    check(d.get("attr") == "always", "close buttons follow Settings", d)


def open_in(b, base):
    (b.home / "browsers.json").write_text(json.dumps([{"id": "firefox", "name": "Firefox", "icon": None, "private": True}, {"id": "chromium", "name": "Chromium", "icon": None, "private": True}]))
    sent = b.home / "openin-sent.log"
    navigate(b, f"{base}/text.html")
    b.js("document.getElementById('nyx-openin-button').click()")
    time.sleep(2)
    rows = b.js("return [...document.querySelectorAll('#PanelUI-nyx-openin .nyx-openin-browser')].map(r => r.label)")
    check(rows == ["Firefox", "Chromium"], "Open in lists the installed browsers", rows)
    b.js("[...document.querySelectorAll('#PanelUI-nyx-openin .nyx-openin-browser')].find(r => r.label === 'Chromium').doCommand()")
    time.sleep(1.5)
    check(sent.exists() and sent.read_text().split() == ["chromium", f"{base}/text.html"], "picking one opens the page there", sent.read_text() if sent.exists() else None)
    b.js("window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, shiftKey: true, code: 'KeyO', key: 'O', bubbles: true }))")
    time.sleep(1.5)
    check(sent.read_text().splitlines()[-1].startswith("chromium"), "Alt+Shift+O uses the last one", sent.read_text())


def selection(b, base):
    navigate(b, f"{base}/text.html")
    b.call("Marionette:SetContext", {"value": "content"})
    x, y = b.js("const r = document.getElementById('p').getBoundingClientRect(); return [r.x + 20, r.y + r.height / 2]")
    pointer(b, x, y, clicks=2)
    b.call("Marionette:SetContext", {"value": "chrome"})
    time.sleep(3)
    d = b.js("const p = document.getElementById('nyx-selection-panel'); return p && { state: p.state, text: p.querySelector('.nyx-sel-query').value, engines: p.querySelectorAll('.nyx-sel-engine').length }")
    check(d and d["state"] == "open" and d["text"] == "Cedar" and d["engines"] > 0, "selecting text shows the search popup with the text and engines", d)
    b.js("document.getElementById('nyx-selection-panel')?.hidePopup()")


def video(b, base):
    navigate(b, f"{base}/watch.html")
    time.sleep(3.5)
    check(not b.js("return document.getElementById('nyx-video-button').hidden"), "a page with a player has the download button")
    b.js("document.getElementById('nyx-video-button').dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }))")
    time.sleep(2)
    d = b.js("const p = document.getElementById('nyx-video-panel'); return { rows: [...p.querySelectorAll('.nyx-video-quality b')].map(n => n.textContent), on: p.querySelector('.nyx-video-quality[nyx-on] b')?.textContent }")
    check(d["rows"] == ["2160p", "1080p", "720p"] and d["on"] == "1080p", "the panel lists the qualities, starting on Settings' choice", d)
    (b.home / "Videos").mkdir(exist_ok=True)
    b.js("document.querySelector('#nyx-video-panel .nyx-video-primary').click()")
    time.sleep(1.2)
    jobs = b.js("return document.querySelectorAll('#nyx-video-jobs .nyx-video-job').length")
    check(jobs == 1, "the download shows in the Downloads panel", jobs)
    time.sleep(3.5)
    done = b.js_async("""const done = arguments[arguments.length-1]; const { Downloads } = ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
      Downloads.getList(Downloads.PUBLIC).then(l => l.getAll()).then(all => done(all.map(d => [d.target.path.split('/').pop(), d.succeeded])));""")
    check(["Ridge loop in 4K [Trail Days].webm", True] in done, "the finished video joins Firefox's downloads", done)


def vpn(b, base, port):
    module = "const { NyxVpn } = ChromeUtils.importESModule('chrome://browser/content/nyx/NyxVpn.sys.mjs'); const done = arguments[arguments.length-1];"
    added = b.js_async(module + "NyxVpn.add({provider:'proxy', type:'http', host:'127.0.0.1', port: arguments[0], username:'user', password:'pass', name:'Test'}).then(done, e => done({ error: String(e) }))", port)
    check("error" not in added, "a proxy can be added", added)
    navigate(b, "http://vpn.test.invalid/page")
    b.call("Marionette:SetContext", {"value": "content"})
    via = b.js("return document.getElementById('via')?.textContent")
    b.call("Marionette:SetContext", {"value": "chrome"})
    check(via == "via the VPN" and proxied and proxied[-1][1].startswith("Basic "), "pages go through the VPN, with its login", [via, proxied[-1:]])
    check(b.js("return document.getElementById('nyx-vpn-button').hasAttribute('nyx-on')"), "the VPN button says it's on for the tab")
    # Browser's own asking for NordVPN's list goes direct, not through the VPN: this host only
    # answers through the test's proxy, which would log it.
    before = len(proxied)
    b.js_async(module + "Services.prefs.setStringPref('nyx.vpn.nordvpn-api', 'http://nordapi.test.invalid/v1'); NyxVpn.countries().then(() => done(1), () => done(0))")
    b.js("Services.prefs.clearUserPref('nyx.vpn.nordvpn-api')")
    through = [p for p in proxied[before:] if "nordapi.test.invalid" in p[0]]
    check(not through, "Browser's own NordVPN requests don't go through the VPN", through)
    b.js("document.getElementById('nyx-vpn-button').click()")
    time.sleep(1.5)
    d = b.js("const v = document.getElementById('PanelUI-nyx-vpn'), body = v.querySelector('.panel-subview-body'); return { view: Math.round(v.getBoundingClientRect().width), content: body.scrollWidth }")
    b.js("document.getElementById('customizationui-widget-panel')?.hidePopup()")
    check(d["view"] >= d["content"], "the VPN panel is as wide as what's in it", d)
    workspace = b.js("return gZenWorkspaces.activeWorkspace")
    b.js_async(module + "NyxVpn.setWorkspace(arguments[0], 'none').then(() => done(1))", workspace)
    before = len(proxied)
    navigate(b, "http://vpn.test.invalid/other")
    check(len(proxied) == before, "a workspace set to No VPN doesn't go through it")
    cleared = b.js_async(module + "const ws = arguments[0]; (async () => { await NyxVpn.setWorkspace(ws, 'default'); for (const c of [...(await NyxVpn.state()).connections]) await NyxVpn.remove(c.id); })().then(() => done(true), e => done(String(e)))", workspace)
    check(cleared is True, "a connection can be removed, its login with it", cleared)
    left = b.js_async(module + "NyxVpn.state().then(s => done({ n: s.connections.length, user: Services.prefs.prefHasUserValue('network.proxy.failover_direct') }))")
    check(not left["user"], "with no VPN, Firefox's own settings come back", left)


def vpn_places(b, base):
    """NordVPN's places in the VPN panel: searching finds cities, choosing one moves there, a
    place with no proxy says so in its row, and a starred place is a favourite that connects."""
    module = "const { NyxVpn } = ChromeUtils.importESModule('chrome://browser/content/nyx/NyxVpn.sys.mjs'); const done = arguments[arguments.length-1];"
    b.js("Services.prefs.setStringPref('nyx.vpn.nordvpn-api', arguments[0])", f"{base}/nord/v1")
    added = b.js_async(module + "NyxVpn.add({ provider: 'nordvpn', username: 'u', password: 'p' }).then(c => done(c.id), e => done({ error: String(e) }))")
    check(isinstance(added, str), "a NordVPN connection can be added", added)
    state = lambda: b.js_async(module + "NyxVpn.state().then(s => done({ c: s.connections.find(c => c.id === arguments[0]), favorites: s.favorites }))", added)  # noqa: E731

    def open_panel():
        b.js("document.getElementById('customizationui-widget-panel')?.hidePopup()")
        time.sleep(0.5)
        b.js("document.getElementById('nyx-vpn-button').click()")
        time.sleep(1.5)

    def search(text):
        b.js("const i = document.querySelector('#PanelUI-nyx-vpn .nyx-vpn-search input'); i.value = arguments[0]; i.dispatchEvent(new Event('input'))", text)
        time.sleep(0.5)

    rows = "return [...document.querySelectorAll('#PanelUI-nyx-vpn .nyx-vpn-places .nyx-vpn-place')].map(r => r.querySelector('.nyx-vpn-grow > span').textContent)"
    click_row = "[...document.querySelectorAll('#PanelUI-nyx-vpn .nyx-vpn-places .nyx-vpn-place')].find(r => r.querySelector('.nyx-vpn-grow > span').textContent === arguments[0]).click()"
    try:
        open_panel()
        search("atl")
        found = b.js(rows)
        check(found == ["Atlanta"], "searching the VPN's places finds cities", found)
        b.js(click_row, "Atlanta")
        time.sleep(1.5)
        c = state()["c"]
        check(c["host"] == "us1.nordvpn.test" and c["place"] == {"kind": "city", "id": 1}, "choosing a city moves the VPN there", c)
        search("santiago")
        b.js(click_row, "Santiago")
        time.sleep(1.2)
        note = b.js("return document.querySelector('#PanelUI-nyx-vpn .nyx-vpn-places .nyx-vpn-note')?.textContent")
        check(note == "No NordVPN proxy here right now" and state()["c"]["host"] == "us1.nordvpn.test", "a place with no proxy says so in its row", note)
        search("swe")
        b.js("[...document.querySelectorAll('#PanelUI-nyx-vpn .nyx-vpn-places .nyx-vpn-place')].find(r => r.textContent.includes('Sweden')).querySelector('.nyx-vpn-star').click()")
        time.sleep(1)
        d = state()
        check(d["favorites"] == [{"kind": "country", "id": 208, "code": "SE", "name": "Sweden"}], "a star makes a place a favourite", d["favorites"])
        favorite = b.js("return [...document.querySelectorAll('#PanelUI-nyx-vpn .nyx-vpn-list:not(.nyx-vpn-places) .nyx-vpn-place')].map(r => r.querySelector('.nyx-vpn-grow > span').textContent)")
        check("Sweden" in favorite, "favourites head the panel's places", favorite)
        b.js("[...document.querySelectorAll('#PanelUI-nyx-vpn .nyx-vpn-list:not(.nyx-vpn-places) .nyx-vpn-place')].find(r => r.textContent.includes('Sweden')).click()")
        time.sleep(1.5)
        c = state()["c"]
        check(c["place"] == {"kind": "country", "id": 208} and c["host"].startswith("se"), "a favourite connects there", c)
    finally:
        b.js("document.getElementById('customizationui-widget-panel')?.hidePopup()")
        b.js_async(module + "(async () => { await NyxVpn.setFavorite({ kind: 'country', id: 208 }, false); await NyxVpn.remove(arguments[0]); })().then(() => done(1), () => done(0))", added)
        b.js("Services.prefs.clearUserPref('nyx.vpn.nordvpn-api')")


def shield(b, base):
    d = b.js_async("""const done = arguments[arguments.length-1]; const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
      (async () => { for (let i = 0; i < 60; i++) { const a = await AddonManager.getAddonByID('uBlock0@raymondhill.net'); if (a?.isActive) return done({ builtin: a.isBuiltin }); await new Promise(r => setTimeout(r, 500)); } done(null); })();""", timeout=40)
    check(d and d["builtin"], "uBlock Origin is built in and running", d)
    time.sleep(6)
    navigate(b, f"{base}/ads.html")
    time.sleep(4)
    count = b.js("const n = document.getElementById('nyx-shield-button'); return !n.hidden && Number(n.querySelector('.nyx-shield-count').value)")
    check(count and count >= 3, "the shield counts what was blocked on the page", count)
    b.js("document.getElementById('nyx-shield-button').dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }))")
    time.sleep(1)
    b.js("document.querySelector('#nyx-shield-panel .nyx-shield-switch').click()")
    time.sleep(4)
    check(b.js("return document.getElementById('nyx-shield-button').hasAttribute('nyx-off')"), "the shield turns blocking off for the site")
    b.js("document.getElementById('nyx-shield-button').dispatchEvent(new MouseEvent('click', { button: 0, bubbles: true }))")
    time.sleep(1)
    b.js("document.querySelector('#nyx-shield-panel .nyx-shield-switch').click()")
    time.sleep(3)
    b.js("document.getElementById('nyx-shield-panel')?.hidePopup()")


CTRL, SHIFT, ALT = "\ue009", "\ue008", "\ue00a"


def press(b, *keys):
    """Key presses from the window, as the keyboard sends them: to the focused page through the
    window, and back to the window's keys if the page doesn't use them. Modifiers are held around
    the last key. (Marionette's content context makes them up in the page, which skips that.)"""
    down = [{"type": "keyDown", "value": k} for k in keys]
    up = [{"type": "keyUp", "value": k} for k in reversed(keys)]
    b._call("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": down + up}]})
    b._call("WebDriver:ReleaseActions", {})


def shortcuts(b, base):
    navigate(b, f"{base}/field.html")
    tabs_now = lambda: b.js("return gBrowser.tabs.length")  # noqa: E731
    before = tabs_now()

    def close_one():
        b.js("const t = gBrowser.addTrustedTab(arguments[0], { inBackground: true }); setTimeout(() => gBrowser.removeTab(t), 1200)", f"{base}/text.html#closed")
        time.sleep(2.2)

    close_one()
    b.js("gBrowser.selectedBrowser.focus()")
    time.sleep(0.3)
    press(b, CTRL, "z")
    time.sleep(1.5)
    d = b.js("return { n: gBrowser.tabs.length, url: gBrowser.currentURI.spec }")
    check(d["n"] == before + 1 and d["url"].endswith("#closed"), "Ctrl+Z on a page reopens the last closed tab", d)
    b.js("gBrowser.removeTab(gBrowser.selectedTab)")
    time.sleep(0.8)

    close_one()
    b.call("Marionette:SetContext", {"value": "content"})
    b.js("document.getElementById('f').focus()")
    b.call("Marionette:SetContext", {"value": "chrome"})
    press(b, "a")
    press(b, "b")
    press(b, CTRL, "z")
    time.sleep(1)
    b.call("Marionette:SetContext", {"value": "content"})
    value = b.js("return document.getElementById('f').value")
    b.call("Marionette:SetContext", {"value": "chrome"})
    check(value != "ab" and tabs_now() == before, "Ctrl+Z in a text field undoes typing, not a closed tab", [value, tabs_now()])

    b.js("gURLBar.focus(); gURLBar.select()")
    press(b, "x")
    press(b, "y")
    press(b, CTRL, "z")
    time.sleep(0.8)
    d = b.js("const v = gURLBar.value; gURLBar.handleRevert(); gBrowser.selectedBrowser.focus(); return { v, n: gBrowser.tabs.length }")
    check(d["v"] != "xy" and d["n"] == before, "Ctrl+Z in the address field undoes typing", d)

    navigate(b, "about:keyboard")
    time.sleep(2.5)
    b.call("Marionette:SetContext", {"value": "content"})
    d = b.js("""const rows = [...document.querySelectorAll('[data-id]')];
      const undo = rows.find(r => r.dataset.id === 'key_undo'), reopen = rows.find(r => r.dataset.id === 'key_restoreLastClosedTabOrWindowOrSession');
      return { rows: rows.length, locked: rows.filter(r => r.classList.contains('internal')).map(r => r.dataset.id),
        undoEdit: undo && getComputedStyle(undo.querySelector('.change')).display, reopen: reopen?.querySelector('.currentShortcut')?.value }""")
    b.call("Marionette:SetContext", {"value": "chrome"})
    check(d["rows"] > 20 and not d["locked"] and d["undoEdit"] != "none", "every shortcut in Keyboard Shortcuts can be changed", d)
    check(d["reopen"] in ("Ctrl+Z", "Ctrl + Z"), "Reopen last closed tab is Ctrl+Z", d)

    keys_module = "const { CustomKeys } = ChromeUtils.importESModule('moz-src:///browser/components/customkeys/CustomKeys.sys.mjs');"
    b.js(keys_module + "CustomKeys.changeKey('key_selectAll', { modifiers: 'accel,alt,shift', key: 'U' })")
    navigate(b, f"{base}/field.html")
    b.call("Marionette:SetContext", {"value": "content"})
    b.js("const f = document.getElementById('f'); f.value = 'cedar spring'; f.focus(); f.setSelectionRange(0, 0)")
    b.call("Marionette:SetContext", {"value": "chrome"})
    press(b, CTRL, ALT, SHIFT, "u")
    time.sleep(0.5)
    b.call("Marionette:SetContext", {"value": "content"})
    selected = b.js("const f = document.getElementById('f'); return [f.selectionStart, f.selectionEnd]")
    b.call("Marionette:SetContext", {"value": "chrome"})
    internal = b.js(keys_module + "CustomKeys.resetKey('key_selectAll'); return document.getElementById('key_selectAll').getAttribute('internal')")
    check(selected == [0, 12] and internal == "true", "a changed internal shortcut works, and goes back to Firefox's on reset", [selected, internal])


def quick_commands(b, base):
    b.js("window.NyxQuickCommands.open()")
    time.sleep(1.5)
    b.js("const i = document.querySelector('#nyx-quick-commands input'); i.value = 'close tab'; i.dispatchEvent(new Event('input'))")
    time.sleep(1)
    d = b.js("const p = document.getElementById('nyx-quick-commands'); return { state: p.state, rows: [...p.querySelectorAll('.nyx-qc-title')].map(t => t.textContent) }")
    check(d["state"] == "open" and "Close this tab" in d["rows"], "F2's Quick Commands find commands", d)
    b.js("document.getElementById('nyx-quick-commands').hidePopup()")


OLD_PASSWORDS = "nyx-passwords_design-nexus_github_io-browser-action"
ADDONS = """const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const { NyxAddons } = ChromeUtils.importESModule('resource://nyx/NyxAddons.sys.mjs');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fileAt = path => { const f = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile); f.initWithPath(path); return f; };
  const install = async path => (await AddonManager.getInstallForFile(fileAt(path))).install();
  const until = async (test, tries = 60) => { for (let i = 0; i < tries; i++) { const v = await test(); if (v) return v; await wait(250); } return null; };
"""


def fake_extension(path, addon_id, background=""):
    """An unsigned extension with `addon_id`, as one from addons.mozilla.org installs."""
    manifest = {
        "manifest_version": 2,
        "name": addon_id,
        "version": "1.0",
        "browser_specific_settings": {"gecko": {"id": addon_id}},
        "permissions": ["storage"],
        "background": {"scripts": ["background.js"]},
    }
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("manifest.json", json.dumps(manifest))
        z.writestr("background.js", background)


def upgrade():
    """A profile from the previous install: the scripts it cached, its old top bar (Passwords'
    extension button, no VPN or Open in), its own uBlock Origin and an extension Browser replaces."""
    home = Path(tempfile.mkdtemp(prefix="nyx-browser-upgrade-"))
    b = Browser({"xpinstall.signatures.required": False}, home=home)
    try:
        b.start()
        b.js("for (const id of ['nyx-passwords-button', 'nyx-vpn-button', 'nyx-openin-button']) CustomizableUI.removeWidgetFromArea(id)")
        b.stop()
        stale = b.profile / "startupCache" / "nyx-stale"
        stale.parent.mkdir(exist_ok=True)
        stale.write_text("from the previous install")
        prefs_js = b.profile / "prefs.js"
        text = prefs_js.read_text()
        line = re.search(r'user_pref\("browser\.uiCustomization\.state", (".*")\);', text)
        state = json.loads(json.loads(line.group(1)))
        nav = state["placements"]["nav-bar"]
        old_at = nav.index("unified-extensions-button")
        nav.insert(old_at, OLD_PASSWORDS)
        text = text.replace(line.group(0), f'user_pref("browser.uiCustomization.state", {json.dumps(json.dumps(state))});')
        prefs_js.write_text(text + 'user_pref("nyx.ui.migration.toolbars", 4);\n')
        profiles = home / ".config/nyx-browser"
        profiles.mkdir(parents=True, exist_ok=True)
        (profiles / "profiles.ini").write_text(f"[Profile0]\nName=default\nIsRelative=0\nPath={b.profile}\nDefault=1\n")
        subprocess.run(["bash", str(ROOT / "tools/purge-caches.sh"), str(profiles)], check=True)

        b.start()
        check(not stale.exists(), "a new install drops the profile's cached scripts")
        nav = b.js("return CustomizableUI.getWidgetIdsInArea('nav-bar')")
        check(
            OLD_PASSWORDS not in nav and nav.index("nyx-passwords-button") == old_at and "nyx-vpn-button" in nav and "nyx-openin-button" in nav,
            "an old top bar gets the built-in Passwords where the extension's was, and VPN and Open in",
            nav,
        )
        check(b.js("return !!window.NyxPasswordsUI && !!document.getElementById('nyx-video-button')"), "the new features load in an old profile")

        fake_extension(home / "openwith.xpi", "openwith@darktrojan.net")
        d = b.js_async(ADDONS + """const done = arguments[arguments.length - 1], path = arguments[0];
          (async () => {
            const id = 'openwith@darktrojan.net', get = () => AddonManager.getAddonByID(id);
            await install(path);
            await until(async () => (await get())?.isActive);
            Services.prefs.clearUserPref('nyx.addons.duplicates-disabled');
            await NyxAddons.settle();
            const off = !(await get()).isActive;
            await (await get()).enable();
            await NyxAddons.settle();
            done({ off, stays: (await get()).isActive });
          })().catch(e => done({ error: String(e) }));""", str(home / "openwith.xpi"), timeout=60)
        check(d.get("off") and d.get("stays"), "an extension Browser replaces is turned off once, and can be turned back on", d)

        fake_extension(home / "ublock.xpi", "uBlock0@raymondhill.net", "browser.storage.local.set({ nyxKept: 'filters' });")
        d = b.js_async(ADDONS + """const done = arguments[arguments.length - 1], path = arguments[0];
          (async () => {
            const id = 'uBlock0@raymondhill.net', get = () => AddonManager.getAddonByID(id);
            const uuid = () => JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'))[id];
            const { ExtensionStorageIDB } = ChromeUtils.importESModule('resource://gre/modules/ExtensionStorageIDB.sys.mjs');
            const read = async () => {
              const ext = WebExtensionPolicy.getByID(id)?.extension;
              if (!ext) return null;
              const db = await ExtensionStorageIDB.open(ExtensionStorageIDB.getStoragePrincipal(ext));
              return (await db.get(['nyxKept'])).nyxKept;
            };
            await install(path);
            const mine = await until(async () => { const a = await get(); return a?.isActive && !a.isBuiltin; });
            const before = uuid(), stored = await until(read);
            await NyxAddons.settle();
            const builtin = await until(async () => { const a = await get(); return a?.isActive && a.isBuiltin; });
            done({ mine: !!mine, stored, builtin: !!builtin, sameUuid: uuid() === before, kept: await until(read, 20),
              prefsBack: !Services.prefs.prefHasUserValue('extensions.webextensions.keepStorageOnUninstall') });
          })().catch(e => done({ error: String(e) }));""", str(home / "ublock.xpi"), timeout=90)
        check(
            d.get("mine") and d.get("stored") and d.get("builtin") and d.get("sameUuid") and d.get("kept") == "filters" and d.get("prefsBack"),
            "a profile's own uBlock Origin gives way to the built-in one, keeping its settings",
            d,
        )
    finally:
        b.stop()
        shutil.rmtree(home, ignore_errors=True)


RECT = "const r = n => { const b = n.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };"
MENU_ITEM_HEIGHTS = """const done = arguments[arguments.length - 1];
  const m = document.getElementById('toolbar-context-menu');
  m.addEventListener('popupshown', () => { const h = document.getElementById('zen-context-menu-compact-mode').getBoundingClientRect().height; m.hidePopup(); done(h); }, { once: true });
  m.openPopup(document.getElementById('nav-bar'), 'after_start');"""
EDIT_SPACE = """const done = arguments[arguments.length - 1], anchor = arguments[0];
  const menu = document.getElementById('nyx-workspaces-menu');
  menu.addEventListener('popupshown', () => menu.activateItem(document.getElementById('nyx-workspaces-menu-edit')), { once: true });
  gZenWorkspaces.openWorkspacesMenu(anchor === 'chip' ? document.getElementById('nyx-workspace-chip') : gZenWorkspaces.activeWorkspaceIndicator);
  setTimeout(() => { const p = document.getElementById('zenWorkspaceMoreActions'); const state = p.state; p.hidePopup(); done(state); }, 1500);"""


def tab_row(b, mode):
    b.js("Services.prefs.setStringPref('nyx.tabs.overflow', arguments[0])", mode)
    time.sleep(0.8)
    return b.js(RECT + """
      const sb = gZenWorkspaces.activeWorkspaceElement.scrollbox;
      const normal = gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute('zen-essential') && !t.hasAttribute('zen-empty-tab'));
      const pinned = gBrowser.visibleTabs.find(t => t.pinned && !t.hasAttribute('zen-essential'));
      const widths = normal.map(t => t.getBoundingClientRect().width);
      const before = r(pinned);
      sb.scrollbox.scrollLeft = 100000;
      const after = r(pinned);
      sb.scrollbox.scrollLeft = 0;
      return { min: Math.round(Math.min(...widths)), pinnedStays: before[0] === after[0] && before[2] === 34,
        arrows: getComputedStyle(sb.shadowRoot.querySelector('#scrollbutton-up')).display };""")


def bar():
    """The bars: the workspace row's hover, tabs in a row that don't fit, compact mode, Edit space,
    the bookmarks bar and the toolbar dots."""
    with Browser({"nyx.sidebar.mode": "expanded"}) as b:
        d = b.js(RECT + "const i = gZenWorkspaces.activeWorkspaceIndicator; return { row: r(i), search: r(i.querySelector('.nyx-tab-search-button')), end: parseFloat(getComputedStyle(i, '::before').insetInlineEnd) }")
        check(d["row"][0] + d["row"][2] - d["end"] <= d["search"][0], "the workspace row's hover stops before tab search", d)
        check(b.js_async(MENU_ITEM_HEIGHTS) > 0, "compact mode is offered with the sidebar")
        check(b.js_async(EDIT_SPACE, "row") == "open", "Edit space opens the space's menu (sidebar)")
    prefs = {"zen.tabs.vertical": False, "nyx.bookmarks.icons-only": True, "browser.toolbars.bookmarks.visibility": "always"}
    with Browser(prefs, width=1440, height=900) as b:
        b.js("for (let i = 0; i < 40; i++) gBrowser.addTrustedTab('about:blank#' + i, { inBackground: true }); gBrowser.pinTab(gBrowser.addTrustedTab('about:blank#pinned', { inBackground: true }));")
        time.sleep(2)
        d = tab_row(b, "shrink")
        check(d["min"] <= 40 and d["pinnedStays"] and d["arrows"] == "none", "Shrink narrows tabs to their icons; pinned tabs stay", d)
        d = tab_row(b, "scroll")
        check(d["min"] >= 76 and d["pinnedStays"] and d["arrows"] != "none", "Scroll keeps tabs' size with arrows; pinned tabs stay", d)
        b.js("Services.prefs.clearUserPref('nyx.tabs.overflow')")
        disabled = b.js("return document.getElementById('cmd_zenCompactModeToggle').hasAttribute('disabled')")
        check(b.js_async(MENU_ITEM_HEIGHTS) == 0 and disabled, "compact mode isn't offered with tabs in a row", disabled)
        check(b.js_async(EDIT_SPACE, "chip") == "open", "Edit space opens the space's menu (tabs in a row)")
        state = b.js_async("""const done = arguments[arguments.length - 1];
          document.getElementById('cmd_zenChangeWorkspaceName').doCommand();
          setTimeout(() => { const p = document.getElementById('nyx-workspace-rename'); const s = p?.state; p?.hidePopup(); done(s); }, 1000);""")
        check(state == "open", "Rename opens a field when the name isn't shown", state)
        d = b.js_async("""const done = arguments[arguments.length - 1];
          (async () => {
            const { PlacesUtils } = ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
            await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.toolbarGuid, type: PlacesUtils.bookmarks.TYPE_FOLDER, title: 'Outdoors' });
            for (let i = 0; i < 60; i++) await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.toolbarGuid, url: 'https://example.com/' + i, title: 'Site ' + i });
            await new Promise(r => setTimeout(r, 2000));
            const items = [...document.querySelectorAll('#PlacesToolbarItems > .bookmark-item:not([container])')];
            const chevron = document.getElementById('PlacesChevron');
            done({ widths: [...new Set(items.map(i => Math.round(i.getBoundingClientRect().width)))], chevron: !chevron.collapsed && chevron.getBoundingClientRect().width > 0 });
          })().catch(e => done({ error: String(e) }));""", timeout=60)
        check(d.get("widths") == [28] and d.get("chevron"), "a full bookmarks bar keeps icons' size, the rest behind a chevron", d)
        d = b.js(RECT + """const v = document.getElementById('nyx-vpn-button'); v.setAttribute('nyx-on', '');
          const glyph = r(v.querySelector('.toolbarbutton-icon')), s = getComputedStyle(v, '::after'), btn = r(v);
          const right = btn[0] + btn[2] - parseFloat(s.insetInlineEnd), bottom = btn[1] + btn[3] - parseFloat(s.bottom);
          v.removeAttribute('nyx-on');
          return { glyph, dot: [right - 7, bottom - 7, right, bottom] };""")
        g, dot = d["glyph"], d["dot"]
        inner = (g[0] + 7, g[1] + 7, g[0] + g[2] - 7, g[1] + g[3] - 7)
        check(dot[0] < inner[2] < dot[2] and dot[1] < inner[3] < dot[3], "the VPN dot sits on the globe's corner, as in the mockup", d)


def main():
    site = Path(tempfile.mkdtemp(prefix="nyx-browser-features-"))
    for name, text in PAGES.items():
        (site / name).write_text(text)
    (site / "clip.webm").write_bytes(b"\x1a\x45\xdf\xa3")
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Site, directory=str(site)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]
    base = f"http://127.0.0.1:{port}"
    try:
        with Browser({"zen.tabs.vertical": True, "nyx.sidebar.mode": "expanded"}) as b:
            for test in (tabs, open_in, selection, video, shield, quick_commands, shortcuts):
                try:
                    test(b, base)
                except Exception as error:  # noqa: BLE001 - each part reports and the next still runs
                    check(False, f"{test.__name__} threw", str(error)[:500])
            try:
                vpn(b, base, port)
            except Exception as error:  # noqa: BLE001
                check(False, "vpn threw", str(error)[:500])
            try:
                vpn_places(b, base)
            except Exception as error:  # noqa: BLE001
                check(False, "vpn_places threw", str(error)[:500])
        for test in (upgrade, bar):
            try:
                test()
            except Exception as error:  # noqa: BLE001
                check(False, f"{test.__name__} threw", str(error)[:500])
    finally:
        server.shutdown()
        shutil.rmtree(site, ignore_errors=True)


if __name__ == "__main__":
    main()
    print(f"\n{len(failures)} failed" if failures else "\nall passed")
    sys.exit(1 if failures else 0)
