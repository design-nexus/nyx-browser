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

  #pageSheet = null;

  /**
   * Puts the theme on all of Browser's own pages, in every process and however early they
   * load: Settings and its dialogs, Add-ons, Downloads, error pages, Reader view, the Nyx
   * extension's dashboard and Assistant panel, and Firefox's other pages. Their colors come from
   * it through zen-theme.css. One stylesheet is registered for them and swapped on each change.
   */
  themePages() {
    if (this.#pageSheet !== null) {
      return;
    }
    this.#pageSheet = "";
    const service = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
      Ci.nsIStyleSheetService
    );
    this.subscribe(css => {
      const uri = Services.io.newURI(`data:text/css;charset=utf-8,${encodeURIComponent(pageSheet(css))}`);
      service.loadAndRegisterSheet(uri, service.USER_SHEET);
      if (this.#pageSheet) {
        const old = Services.io.newURI(this.#pageSheet);
        if (service.sheetRegistered(old, service.USER_SHEET)) {
          service.unregisterSheet(old, service.USER_SHEET);
        }
      }
      this.#pageSheet = uri.spec;
    });
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

/**
 * The theme's tokens for Browser's own pages: `about:` pages but a blank one (which a website
 * can read), `chrome:` documents but the developer tools (which keep their own theme), and
 * extensions' pages. A user sheet may name the pages it's for, and its important values win
 * over each page's built-in ones.
 */
function pageSheet(css) {
  const tokens = [...css.matchAll(/(--nyx-[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)]
    .map(([, name, value]) => `${name}: ${value.trim().replace(/\s*!important$/, "")} !important;`)
    .join("\n    ");
  return `@-moz-document regexp("about:(?!blank|srcdoc).*"), regexp("chrome://(?!devtools/).*"), url-prefix("moz-extension://") {
  :root {
    ${tokens}
  }
}
`;
}

/** Named by NYX_BROWSER_BRIDGE, else beside the browser as a package installs it, else on PATH. */
export async function findBridge() {
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
