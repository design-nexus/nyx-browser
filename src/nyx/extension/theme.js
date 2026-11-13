/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser puts the suite's theme on this extension's pages itself (NyxTheme.sys.mjs). A page
 * that draws something from it, such as its tab icon, hears "nyx-theme" when it changes. */
"use strict";

function followTheme() {
  const read = () => {
    const style = getComputedStyle(document.documentElement);
    return ["--nyx-scheme", "--nyx-bg", "--nyx-text", "--nyx-accent"].map(name => style.getPropertyValue(name)).join();
  };
  let last = null;
  const check = () => {
    const now = read();
    if (now !== last) {
      last = now;
      document.dispatchEvent(new Event("nyx-theme"));
    }
  };
  check();
  // Appearance and the suite can change while this page stays open.
  setInterval(check, 1000);
  document.addEventListener("visibilitychange", () => document.hidden || check());
  window.addEventListener("focus", check);
}

followTheme();
