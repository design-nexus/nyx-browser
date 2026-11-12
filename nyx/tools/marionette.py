"""Drive a private, headless Zen through Marionette. Standard library only.

The browser runs with its own HOME and XDG folders under a temporary directory, so a run
can't touch the user's browsers or show a window.
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

DEFAULT_RUNTIME = Path.home() / ".local/share/nyx-browser/runtime/1.24b/zen"

BASE_PREFS = {
    "marionette.port": 2829,
    "app.update.enabled": False,
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


class Browser:
    """One headless browser with a scratch profile. Use as a context manager."""

    def __init__(self, prefs=None, runtime=DEFAULT_RUNTIME, width=1440, height=900, port=2829, home=None, tokens=None, env=None):
        self.tokens = tokens
        self.extra_env = env or {}
        self.prefs = {**BASE_PREFS, **(prefs or {}), "marionette.port": port}
        self.runtime = Path(runtime)
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
            **self.extra_env,
        }
        self.proc = subprocess.Popen(
            [str(self.runtime / "zen-bin"), "--marionette", "--no-remote", "--profile", str(self.profile)],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=(self.home / "browser.log").open("ab"),
        )
        self._connect()
        self._call("WebDriver:NewSession", {"capabilities": {"alwaysMatch": {"acceptInsecureCerts": True}}})
        self._call("Marionette:SetContext", {"value": "chrome"})
        self.wait_ready()

    def write_tokens(self, css):
        """What the launcher does: replace the theme file atomically."""
        path = self.home / ".local/state/nyx-browser/tokens.css"
        path.parent.mkdir(parents=True, exist_ok=True)
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
