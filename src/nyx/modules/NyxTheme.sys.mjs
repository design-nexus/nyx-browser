/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser's theme from Theme Engine 2.0. One `nyx-browser-bridge theme --watch` runs for the
// session and prints the stylesheet again after every change; each window and page that
// subscribes swaps it in. Nothing polls. Without the bridge, the stylesheets' own values stay.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
});

const BRIDGE = "nyx-browser-bridge";
// A bridge replaced by an update ends; it's started again, but not in a loop.
const MAX_STARTS = 3;

class Theme {
  #css = null;
  #subscribers = new Set();
  #process = null;
  #starting = null;
  #starts = 0;

  /** The current stylesheet, or null before the bridge has answered. */
  get css() {
    return this.#css;
  }

  /**
   * Calls `apply(css)` now, if the theme is known, and after every change.
   *
   * @param {Function} apply
   * @returns {Function} Stops the calls.
   */
  subscribe(apply) {
    this.#subscribers.add(apply);
    if (this.#css) {
      apply(this.#css);
    }
    this.#start();
    return () => this.#subscribers.delete(apply);
  }

  /** Asks for the theme again, after Browser has saved its own choices. */
  refresh() {
    this.#process?.stdin.write("\n").catch(() => {});
  }

  #start() {
    if (this.#starting || this.#starts >= MAX_STARTS) {
      return;
    }
    this.#starts++;
    this.#starting = this.#run()
      .catch(error => console.error("Browser: the theme bridge stopped", error))
      .finally(() => {
        this.#process = null;
        this.#starting = null;
        if (this.#subscribers.size && !Services.startup.shuttingDown) {
          this.#start();
        }
      });
  }

  async #run() {
    const command = await findBridge();
    if (!command) {
      this.#starts = MAX_STARTS;
      return;
    }
    this.#process = await lazy.Subprocess.call({
      command,
      arguments: ["theme", "--watch"],
      stderr: "ignore",
    });
    let buffer = "";
    for (;;) {
      const chunk = await this.#process.stdout.readString();
      if (!chunk) {
        break;
      }
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        this.#receive(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
      }
    }
  }

  #receive(line) {
    let css;
    try {
      ({ css } = JSON.parse(line));
    } catch {
      return;
    }
    if (typeof css !== "string" || css === this.#css) {
      return;
    }
    this.#css = css;
    for (const apply of this.#subscribers) {
      try {
        apply(css);
      } catch (error) {
        console.error(error);
      }
    }
  }
}

/** Named by NYX_BROWSER_BRIDGE, else beside the browser as a package installs it, else on PATH. */
async function findBridge() {
  const named = Services.env.get("NYX_BROWSER_BRIDGE");
  if (named) {
    return named;
  }
  const beside = Services.dirsvc.get("GreBinD", Ci.nsIFile);
  beside.append(BRIDGE);
  if (beside.exists() && beside.isExecutable()) {
    return beside.path;
  }
  try {
    return await lazy.Subprocess.pathSearch(BRIDGE);
  } catch {
    return null;
  }
}

export const NyxTheme = new Theme();
