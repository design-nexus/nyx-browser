"""Drive a private, headless Browser through Marionette. Standard library only.

The browser runs with its own HOME and XDG folders under a temporary directory, so a run
can't touch the user's browsers or show a window. It's the build in engine/obj-*/dist/bin, or
the folder named by NYX_BROWSER_DIR (an installed copy, a release tarball).

Its theme comes from a stand-in for `nyx-browser-bridge theme --watch` that serves whatever the
test last wrote with write_tokens(), so tests can set any theme and change it live. The stand-in
also answers the Share dropdown's `share-destinations`, from share-destinations.json in the home
folder (Share is unavailable without it), and logs each `share-to` to share-sent.log there. Open
in's `browsers` come from browsers.json there (none without it), and each `open-in` goes to
openin-sent.log.
"""

import base64
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def default_build():
    named = os.environ.get("NYX_BROWSER_DIR")
    if named:
        return Path(named)
    builds = sorted(ROOT.glob("engine/obj-*/dist/bin"))
    if not builds:
        raise RuntimeError("No build in engine/: run `npx surfer build`, or set NYX_BROWSER_DIR")
    return builds[0]


FAKE_BRIDGE = """#!/usr/bin/env python3
import json, os, sys, threading, time
path = sys.argv[1]
home = os.path.dirname(path)
args = sys.argv[1:]
if args[:1] == ["share-destinations"]:
    try:
        print(open(os.path.join(home, "share-destinations.json")).read())
    except OSError:
        print(json.dumps({"code": "unavailable", "error": "Share isn't available."}))
        sys.exit(1)
    sys.exit(0)
if args[:1] == ["share-to"]:
    with open(os.path.join(home, "share-sent.log"), "a") as log:
        log.write(" ".join(args[1:]) + "\\n")
    print("{}")
    sys.exit(0)
if args[:1] == ["browsers"]:
    try:
        print(open(os.path.join(home, "browsers.json")).read())
    except OSError:
        print("[]")
    sys.exit(0)
if args[:1] == ["open-in"]:
    with open(os.path.join(home, "openin-sent.log"), "a") as log:
        log.write(" ".join(args[1:]) + "\\n")
    print("{}")
    sys.exit(0)
if args[:1] == ["video-version"]:
    print(json.dumps({"version": "2026.08.19", "path": "/usr/bin/yt-dlp"}))
    sys.exit(0)
if args[:1] == ["video-info"]:
    print(json.dumps({"title": "Ridge loop in 4K: Calera to the saddle", "channel": "Trail Days", "site": "Youtube", "duration": 1122,
        "thumbnail": None, "qualities": [{"height": 2160, "size": 1900000000}, {"height": 1080, "size": 620000000}, {"height": 720, "size": 310000000}],
        "audio_size": 18000000, "subtitles": True}))
    sys.exit(0)
if args[:1] == ["video-download"]:
    with open(os.path.join(home, "video-sent.log"), "a") as log:
        log.write(" ".join(args[1:]) + "\\n")
    folder = args[args.index("--folder") + 1]
    for done in (100, 300, 620):
        print(json.dumps({"t": "progress", "downloaded": done * 1000000, "total": 620000000, "speed": 48000000, "eta": 5, "status": "downloading"}), flush=True)
        time.sleep(0.6)
    print(json.dumps({"t": "stage", "stage": "merging"}), flush=True)
    time.sleep(0.6)
    path = os.path.join(folder, "Ridge loop in 4K [Trail Days].webm")
    open(path, "wb").write(b"video")
    print(json.dumps({"t": "done", "file": path}))
    sys.exit(0)
def eof():
    sys.stdin.read()
    os._exit(0)
threading.Thread(target=eof, daemon=True).start()
shown = None
while True:
    try:
        css = open(path).read()
    except OSError:
        css = None
    if css is not None and css != shown:
        print(json.dumps({"css": css}), flush=True)
        shown = css
    time.sleep(0.1)
"""

BASE_PREFS = {
    "marionette.port": 2829,
    "browser.shell.checkDefaultBrowser": False,
    "browser.startup.page": 3,
    "browser.sessionstore.interval": 500,
    "datareporting.policy.dataSubmissionEnabled": False,
    "toolkit.telemetry.enabled": False,
    "zen.welcome-screen.seen": True,
    "zen.watermark.enabled": False,
    "extensions.update.enabled": False,
    "general.smoothScroll": False,
}


class ScriptError(RuntimeError):
    pass


PASSWORDS_XPI = Path("nyx-passwords/browser/nyx-passwords-firefox.xpi")


def passwords_extension():
    """Nyx Passwords' extension where this machine has it, or None."""
    data_home = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local/share")
    dirs = [data_home, *(os.environ.get("XDG_DATA_DIRS") or "/usr/local/share:/usr/share").split(":")]
    for d in filter(None, dirs):
        xpi = Path(d) / PASSWORDS_XPI
        if xpi.exists():
            return xpi.resolve()
    return None


class Browser:
    """One headless browser with a scratch profile. Use as a context manager."""

    def __init__(self, prefs=None, runtime=None, width=1440, height=900, port=2829, home=None, tokens=None, env=None, passwords=False):
        self.tokens = tokens
        # Nyx Passwords' extension, from this machine's install, as the browser finds it there.
        self.passwords = passwords_extension() if passwords else None
        self.extra_env = env or {}
        self.prefs = {**BASE_PREFS, **(prefs or {}), "marionette.port": port}
        self.runtime = Path(runtime) if runtime else default_build()
        self.size = (width, height)
        self.port = port
        self.own_home = home is None
        self.home = Path(home) if home else Path(tempfile.mkdtemp(prefix="nyx-browser-test-"))
        self.profile = self.home / "profile"
        self.proc = None
        self.sock = None
        self.next_id = 0

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *_):
        self.stop()
        if self.own_home:
            shutil.rmtree(self.home, ignore_errors=True)

    def start(self):
        self.profile.mkdir(parents=True, exist_ok=True)
        lines = [f"user_pref({json.dumps(k)}, {json.dumps(v)});" for k, v in self.prefs.items()]
        (self.profile / "user.js").write_text("\n".join(lines) + "\n")
        if self.tokens is not None:
            self.write_tokens(self.tokens)
        if self.passwords:
            xpi = self.home / ".local/share" / PASSWORDS_XPI
            xpi.parent.mkdir(parents=True, exist_ok=True)
            if not xpi.exists():
                xpi.symlink_to(self.passwords)
        bridge = self.home / "bin/nyx-browser-bridge"
        bridge.parent.mkdir(parents=True, exist_ok=True)
        bridge.write_text(FAKE_BRIDGE.replace("sys.argv[1]", json.dumps(str(self.tokens_file))))
        bridge.chmod(0o755)
        env = {
            **os.environ,
            "HOME": str(self.home),
            "XDG_CONFIG_HOME": str(self.home / ".config"),
            "XDG_CACHE_HOME": str(self.home / ".cache"),
            "XDG_DATA_HOME": str(self.home / ".local/share"),
            "XDG_STATE_HOME": str(self.home / ".local/state"),
            "MOZ_HEADLESS": "1",
            "MOZ_HEADLESS_WIDTH": str(self.size[0]),
            "MOZ_HEADLESS_HEIGHT": str(self.size[1]),
            "MOZ_DISABLE_AUTO_SAFE_MODE": "1",
            "MOZ_REMOTE_ALLOW_SYSTEM_ACCESS": "1",
            "NYX_BROWSER_BRIDGE": str(bridge),
            **self.extra_env,
        }
        self.proc = subprocess.Popen(
            [str(self.runtime / "nyx-browser"), "--marionette", "--no-remote", "--profile", str(self.profile)],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=(self.home / "browser.log").open("ab"),
        )
        self._connect()
        self._call("WebDriver:NewSession", {"capabilities": {"alwaysMatch": {"acceptInsecureCerts": True}}})
        self._call("Marionette:SetContext", {"value": "chrome"})
        self.wait_ready()

    @property
    def tokens_file(self):
        return self.home / "theme.css"

    def write_tokens(self, css):
        """What the theme bridge does on a change: hand the browser a new stylesheet."""
        path = self.tokens_file
        temporary = path.with_suffix(".tmp")
        temporary.write_text(css)
        temporary.replace(path)

    def stop(self):
        if self.sock:
            try:
                self._call("Marionette:Quit", {}, timeout=20)
            except Exception:
                pass
            self.sock.close()
            self.sock = None
        if self.proc:
            try:
                self.proc.wait(timeout=20)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
            self.proc = None

    def restart(self):
        self.stop()
        self.start()

    def wait_ready(self, timeout=60):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                if self.js("return !!(window.gBrowser && window.gZenWorkspaces && gZenWorkspaces._hasInitializedTabsStrip !== undefined || window.gBrowser)"):
                    time.sleep(2)
                    return
            except ScriptError:
                pass
            time.sleep(0.25)
        raise TimeoutError("the browser window didn't get ready")

    def js(self, script, *args):
        """Run a function body in the browser window's chrome scope and return its value."""
        return self._call("WebDriver:ExecuteScript", {"script": script, "args": list(args)})["value"]

    def js_async(self, script, *args, timeout=30):
        """Run a function body whose last argument is a callback taking the result."""
        return self._call(
            "WebDriver:ExecuteAsyncScript",
            {"script": script, "args": list(args), "scriptTimeout": timeout * 1000},
            timeout=timeout + 5,
        )["value"]

    def call(self, name, params, timeout=60):
        """A Marionette command by name."""
        return self._call(name, params, timeout)

    def screenshot(self, path):
        data = self._call("WebDriver:TakeScreenshot", {"full": False})["value"]
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(base64.b64decode(data))

    def log(self):
        return (self.home / "browser.log").read_text(errors="replace")

    def _connect(self, timeout=60):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"the browser exited with {self.proc.returncode}:\n{self.log()[-2000:]}")
            try:
                self.sock = socket.create_connection(("127.0.0.1", self.port), timeout=2)
                self.sock.settimeout(60)
                self._read()
                return
            except OSError:
                time.sleep(0.25)
        raise TimeoutError("Marionette didn't start")

    def _read(self):
        length = b""
        while not length.endswith(b":"):
            chunk = self.sock.recv(1)
            if not chunk:
                raise ConnectionError("Marionette closed the connection")
            length += chunk
        size = int(length[:-1])
        body = b""
        while len(body) < size:
            chunk = self.sock.recv(min(1 << 20, size - len(body)))
            if not chunk:
                raise ConnectionError("Marionette closed the connection")
            body += chunk
        return json.loads(body)

    def _call(self, name, params, timeout=60):
        self.next_id += 1
        body = json.dumps([0, self.next_id, name, params]).encode()
        self.sock.settimeout(timeout)
        self.sock.sendall(str(len(body)).encode() + b":" + body)
        while True:
            reply = self._read()
            if reply[1] == self.next_id:
                break
        if reply[2]:
            raise ScriptError(f"{reply[2].get('error')}: {reply[2].get('message')}\n{reply[2].get('stacktrace', '')[:800]}")
        return reply[3]
