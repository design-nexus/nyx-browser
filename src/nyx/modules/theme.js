/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Puts the theme on this window: the stylesheet NyxTheme gives, swapped in place on each change,
 * Zen's light or dark scheme to match, and reduced motion when the theme asks for it. */
{
  const { NyxTheme } = ChromeUtils.importESModule(
    "chrome://browser/content/nyx/NyxTheme.sys.mjs"
  );
  const utils = window.windowUtils;
  let loaded = null;

  function apply(css) {
    const url = `data:text/css;charset=utf-8,${encodeURIComponent(css)}`;
    utils.loadSheetUsingURIString(url, utils.AUTHOR_SHEET);
    if (loaded) {
      utils.removeSheetUsingURIString(loaded, utils.AUTHOR_SHEET);
    }
    loaded = url;

    const style = getComputedStyle(document.documentElement);
    const scheme = { dark: 0, light: 1 }[style.getPropertyValue("--nyx-scheme").trim()];
    if (scheme !== undefined && Services.prefs.getIntPref("zen.view.window.scheme", 2) !== scheme) {
      Services.prefs.setIntPref("zen.view.window.scheme", scheme);
    }
    document.documentElement.toggleAttribute(
      "nyx-reduced-motion",
      style.getPropertyValue("--nyx-reduced-motion").trim() === "1"
    );
  }

  const stop = NyxTheme.subscribe(apply);
  window.addEventListener("unload", stop, { once: true });
}
