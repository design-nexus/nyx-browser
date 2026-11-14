/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// less.js (Apache-2.0), for Browser's site styles and imported UserCSS. One sandbox loads
// the library; each render is a promise of CSS.

const LESS_URI = "chrome://browser/content/nyx/sitestyles/vendor/less.min.js";

let lessPromise = null;

async function less() {
  if (!lessPromise) {
    lessPromise = loadLess();
  }
  return lessPromise;
}

async function loadLess() {
  const source = await (await fetch(LESS_URI)).text();
  const sandbox = Cu.Sandbox(Services.scriptSecurityManager.getSystemPrincipal(), {
    sandboxName: "NyxLess",
    wantXrays: false,
  });
  // less.js expects a browser-like global.
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    getElementsByTagName: () => [],
    currentScript: null,
    createElement: () => ({ setAttribute() {}, style: {} }),
  };
  sandbox.location = { href: LESS_URI, protocol: "chrome:" };
  sandbox.navigator = { userAgent: "Nyx" };
  sandbox.console = console;
  sandbox.setTimeout = (fn, ms, ...args) => {
    const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback(() => fn(...args), ms || 0, Ci.nsITimer.TYPE_ONE_SHOT);
    return timer;
  };
  sandbox.clearTimeout = timer => timer?.cancel();
  Cu.evalInSandbox(source, sandbox, "latest", LESS_URI, 1);
  if (!sandbox.less?.render) {
    throw new Error("less.js didn't load.");
  }
  return sandbox.less;
}

/**
 * Compiles LESS to CSS.
 *
 * @param {string} input
 * @param {object} [options] filename, and any less.render options
 * @returns {Promise<string>}
 */
export async function render(input, options = {}) {
  const api = await less();
  const result = await api.render(input, {
    filename: options.filename || "style.less",
    math: "always",
    ...options,
  });
  return result.css;
}

export const NyxLess = { render };
