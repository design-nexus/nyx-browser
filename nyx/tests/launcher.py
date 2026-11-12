#!/usr/bin/env python3
"""The installed launcher starts the runtime on its own profile and keeps the theme current.

    ./install.sh && tests/launcher.py

Runs headless with its own folders, borrowing the installed runtime through a link.
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

LAUNCHER = Path.home() / ".local/bin/nyx-browser"
RUNTIME = Path.home() / ".local/share/nyx-browser/runtime"
PORT = 2831


def read(sock):
    length = b""
    while not length.endswith(b":"):
        length += sock.recv(1)
    size, body = int(length[:-1]), b""
    while len(body) < size:
        body += sock.recv(size - len(body))
    return json.loads(body)


def main():
    home = Path(tempfile.mkdtemp(prefix="nyx-browser-launcher-"))
    data = home / "data"
    (data / "nyx-browser").mkdir(parents=True)
    (data / "nyx-browser/runtime").symlink_to(RUNTIME)
    profile = data / "nyx-browser/profile"
    profile.mkdir()
    (profile / "user.js").write_text(f'user_pref("marionette.port", {PORT});\n')
    config = home / "config"
    (config / "nyx").mkdir(parents=True)
    suite = config / "nyx/theme.toml"
    suite.write_text('mode = "theme"\ntheme = "catppuccin-mocha"\n')
    tokens = home / "state/nyx-browser/tokens.css"
    env = {
        **os.environ,
        "HOME": str(home),
        "XDG_DATA_HOME": str(data),
        "XDG_CONFIG_HOME": str(config),
        "XDG_STATE_HOME": str(home / "state"),
        "XDG_CACHE_HOME": str(home / "cache"),
        "MOZ_HEADLESS": "1",
        "MOZ_REMOTE_ALLOW_SYSTEM_ACCESS": "1",
    }
    process = subprocess.Popen([str(LAUNCHER), "--marionette"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    failed = []
    try:
        sock = None
        for _ in range(240):
            try:
                sock = socket.create_connection(("127.0.0.1", PORT), timeout=2)
                break
            except OSError:
                time.sleep(0.25)
        if not sock:
            failed.append("the browser didn't start from the launcher")
            return 1
        read(sock)

        def call(index, name, params):
            body = json.dumps([0, index, name, params]).encode()
            sock.sendall(str(len(body)).encode() + b":" + body)
            while True:
                reply = read(sock)
                if reply[1] == index:
                    if reply[2]:
                        raise RuntimeError(reply[2])
                    return reply[3]

        call(1, "WebDriver:NewSession", {})
        call(2, "Marionette:SetContext", {"value": "chrome"})
        time.sleep(4)
        state = call(3, "WebDriver:ExecuteScript", {"script": r"""
            return {
              profile: Services.dirsvc.get("ProfD", Ci.nsIFile).path,
              remoting: Services.appinfo.remotingName,
              bg: getComputedStyle(document.documentElement).getPropertyValue("--nyx-bg").trim(),
              zen: Services.appinfo.version,
            };
        """, "args": []})["value"]

        if state["profile"] != str(profile):
            failed.append(f"wrong profile: {state['profile']}")
        if state["bg"] != "#1e1e2e":
            failed.append(f"the suite's theme didn't arrive: {state}")
        if "--nyx-bg: #1e1e2e" not in tokens.read_text():
            failed.append("the launcher didn't write the theme")

        suite.write_text('mode = "theme"\ntheme = "nyx-light"\n')
        changed = False
        for index in range(4, 40):
            bg = call(index, "WebDriver:ExecuteScript", {"script": 'return getComputedStyle(document.documentElement).getPropertyValue("--nyx-bg").trim()', "args": []})["value"]
            if bg != "#1e1e2e":
                changed = True
                break
            time.sleep(0.25)
        if not changed:
            failed.append("changing the suite's theme didn't reach the running browser")
        try:
            call(99, "Marionette:Quit", {})
        except (ConnectionError, OSError):
            pass
    finally:
        try:
            process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        shutil.rmtree(home, ignore_errors=True)
        for line in failed:
            print(f"FAIL {line}")
    print("PASS launcher" if not failed else "\nThe launcher failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
