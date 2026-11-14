#!/usr/bin/env python3
"""Nyx Passwords, built in: pairing, the key in login fields, the menu under a field, filling,
the save bar, the popup and passkeys, against a stand-in for Passwords' host (a made-up vault).

    tests/passwords.py

The hard case is the page: a sign-in in a modal dialog, drawn by a web component in a closed
shadow root, with no <form>. Needs Passwords' extension files on this machine (its pages), and
node for the stand-in host.
"""

import base64
import functools
import http.server
import json
import shutil
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from marionette import Browser, passwords_extension  # noqa: E402

failures = []

PAGE = """<!doctype html><meta charset="utf-8"><title>Sign in · Field Notes</title>
<style>body{font:15px sans-serif;background:#fbfaf7;margin:0;padding:40px}dialog{border:0;border-radius:14px;padding:28px;width:340px}</style>
<h1>Field Notes</h1><button id="open">Log in</button><dialog id="d"><login-box></login-box></dialog>
<script>
  customElements.define("login-box", class extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: "closed" });
      root.innerHTML = `<style>input{display:block;width:100%;box-sizing:border-box;height:40px;margin:6px 0 14px}</style>
        <label>Email or username<input id="u" name="identifier" type="text"></label>
        <label>Password<input id="p" name="pw" type="password"></label>
        <button id="go" type="button">Sign in</button>`;
      window.__root = root;
      root.getElementById("go").addEventListener("click", () => setTimeout(() => document.getElementById("d").close(), 100));
    }
  });
  document.getElementById("open").onclick = () => document.getElementById("d").showModal();
  window.signInWithPasskey = () => navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), rpId: "127.0.0.1" } })
    .then(c => (window.__passkey = c.id), e => (window.__passkey = "ERR " + e));
</script>"""

IMPORT = "const { NyxPasswords } = ChromeUtils.importESModule('chrome://browser/content/nyx/NyxPasswords.sys.mjs');"


def check(ok, message, detail=None):
    print(("ok  " if ok else "FAIL") + f"  {message}" + ("" if ok or detail is None else f": {detail}"))
    if not ok:
        failures.append(message)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve(folder):
    handler = functools.partial(QuietHandler, directory=str(folder))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def pointer(b, x, y):
    b._call("WebDriver:PerformActions", {"actions": [{"type": "pointer", "id": "mouse", "parameters": {"pointerType": "mouse"}, "actions": [
        {"type": "pointerMove", "x": int(x), "y": int(y), "origin": "viewport"}, {"type": "pointerDown", "button": 0}, {"type": "pointerUp", "button": 0}]}]})
    b._call("WebDriver:ReleaseActions", {})


def type_keys(b, text):
    keys = [{"type": "keyDown", "value": c} for c in text] + [{"type": "keyUp", "value": c} for c in text]
    b._call("WebDriver:PerformActions", {"actions": [{"type": "key", "id": "kb", "actions": keys}]})
    b._call("WebDriver:ReleaseActions", {})


def center(b, expression):
    return b.js(f"const r = {expression}.getBoundingClientRect(); return [r.x + Math.min(30, r.width / 2), r.y + r.height / 2]")


def main():
    if not passwords_extension() or not shutil.which("node"):
        print("Nyx Passwords' pages or node aren't on this machine: skipped")
        return
    home = Path(tempfile.mkdtemp(prefix="nyx-browser-passwords-"))
    site = home / "site"
    site.mkdir()
    (site / "login.html").write_text(PAGE)
    server = serve(site)
    url = f"http://127.0.0.1:{server.server_address[1]}/login.html"
    host = home / "bin/fake-passwords-host.mjs"
    host.parent.mkdir(parents=True)
    shutil.copy(ROOT / "tools/fake-passwords-host.mjs", host)
    host.chmod(0o755)
    manifests = home / ".mozilla/native-messaging-hosts"
    manifests.mkdir(parents=True)
    (manifests / "io.github.design_nexus.nyx.passwords.json").write_text(json.dumps({
        "name": "io.github.design_nexus.nyx.passwords", "description": "stand-in", "path": str(host), "type": "stdio",
        "allowed_extensions": ["nyx-passwords@design-nexus.github.io"]}))
    requests = host.parent / "passwords-requests.log"
    try:
        with Browser({}, home=home, passwords=True) as b:
            paired = b.js_async(IMPORT + "const done = arguments[arguments.length-1]; NyxPasswords.fromPage('popup', {cmd:'pair'}, window).then(done, e => done(String(e)))")
            check(paired.get("state") == "pending" and len(paired.get("code", "")) == 6, "Browser pairs with Passwords' host and shows the code", paired)
            status = b.js_async(IMPORT + "const done = arguments[arguments.length-1]; NyxPasswords.fromPage('popup', {cmd:'status'}, window).then(done, e => done(String(e)))")
            check(status.get("state") == "unlocked", "sealed requests reach the vault", status)
            check(b.js("return !!document.getElementById('nyx-passwords-button')"), "the Passwords button is Browser's own")

            b.call("Marionette:SetContext", {"value": "content"})
            b.call("WebDriver:Navigate", {"url": url})
            time.sleep(1)
            pointer(b, *center(b, "document.getElementById('open')"))
            time.sleep(1)
            pointer(b, *center(b, "window.__root.getElementById('u')"))
            time.sleep(1.5)
            keys = b.js("return [document.querySelectorAll('nyx-passwords-key').length, document.querySelectorAll('dialog nyx-passwords-key').length]")
            check(keys == [2, 2], "the key shows in both fields of a closed shadow root in a modal dialog", keys)
            check(b.js("return !String(navigator.credentials.get).includes('[native code]')"), "passkey requests go to Passwords first")

            b.call("Marionette:SetContext", {"value": "chrome"})
            time.sleep(1.5)
            menu = b.js("""const p = document.getElementById('nyx-passwords-menu'); const d = p?.querySelector('browser')?.contentDocument;
              return p && { state: p.state, rows: [...(d?.querySelectorAll('.row .sub') ?? [])].map(t => t.textContent) }""")
            check(menu and menu["state"] == "open" and menu["rows"] == ["ken@design-nex.us", "ken.trail"], "clicking the field opens the menu with the site's logins", menu)
            b.js("document.querySelector('#nyx-passwords-menu browser').contentDocument.querySelector('.row').click()")
            time.sleep(1.5)
            b.call("Marionette:SetContext", {"value": "content"})
            filled = b.js("return [window.__root.getElementById('u').value, window.__root.getElementById('p').value]")
            check(filled == ["ken@design-nex.us", "hunter2-ridge"], "picking a login fills both fields", filled)

            b.js("window.__root.getElementById('p').value = ''")
            pointer(b, *center(b, "window.__root.getElementById('p')"))
            type_keys(b, "brand-new-pw")
            pointer(b, *center(b, "window.__root.getElementById('go')"))
            b.call("Marionette:SetContext", {"value": "chrome"})
            time.sleep(4)
            bar = b.js("const p = document.getElementById('nyx-passwords-bar'); return p && { state: p.state, question: p.querySelector('browser')?.contentDocument?.getElementById('question')?.textContent }")
            check(bar and bar["state"] == "open" and bar["question"].startswith("Save this login"), "a new password signed in with brings the save bar", bar)
            b.js("document.getElementById('nyx-passwords-bar')?.hidePopup()")

            b.call("Marionette:SetContext", {"value": "content"})
            b.js("window.signInWithPasskey()")
            b.call("Marionette:SetContext", {"value": "chrome"})
            time.sleep(1.5)
            card = b.js("const p = document.getElementById('nyx-passwords-passkey'); return p && { state: p.state, title: p.querySelector('browser')?.contentDocument?.getElementById('title')?.textContent }")
            check(card and card["state"] == "open" and card["title"].startswith("Sign in to"), "a passkey request shows Passwords' card", card)
            time.sleep(3)
            b.call("Marionette:SetContext", {"value": "content"})
            passkey = b.js("return window.__passkey")
            check(passkey == "Y3JlZGVudGlhbA", "with one passkey the card signs in by itself", passkey)

            b.call("Marionette:SetContext", {"value": "chrome"})
            b.js("document.getElementById('nyx-passwords-button').click()")
            time.sleep(3)
            popup = b.js("""const d = document.querySelector('#PanelUI-nyx-passwords browser')?.contentDocument;
              return d && { panes: !d.getElementById('panes')?.hidden, rows: d.querySelectorAll('.row').length }""")
            check(popup and popup["panes"] and popup["rows"] >= 2, "the button opens Passwords' popup, with the vault", popup)
            log = requests.read_text() if requests.exists() else ""
            check('"r":"check"' in log and "brand-new-pw" in log, "the submitted login is checked before the bar asks")
    finally:
        server.shutdown()
        shutil.rmtree(home, ignore_errors=True)


if __name__ == "__main__":
    main()
    print(f"\n{len(failures)} failed" if failures else "\nall passed")
    sys.exit(1 if failures else 0)
