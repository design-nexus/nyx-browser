/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser's own chrome, loaded into each browser window by Zen's ZenPreloadedScripts.js. The
 * stylesheets go on at once, so the first paint has them; the modules run once the window's
 * globals exist. */
{
  const base = "chrome://browser/content/nyx";
  const sheets = ["theme.css", "layout.css", "horizontal.css"];
  const modules = [
    "addons.js",
    "theme.js",
    "sidebar.js",
    "appearance.js",
    "actions.js",
    "toolbar.js",
    "sidebar-parts.js",
  ];

  const utils = window.windowUtils;
  for (const sheet of sheets) {
    utils.loadSheetUsingURIString(`${base}/styles/${sheet}`, utils.AUTHOR_SHEET);
  }

  const beforeShow = subject => {
    if (subject !== window) {
      return;
    }
    Services.obs.removeObserver(beforeShow, "browser-window-before-show");
    for (const module of modules) {
      try {
        Services.scriptloader.loadSubScript(`${base}/modules/${module}`, window);
      } catch (error) {
        console.error(`Browser: ${module} failed to load`, error);
      }
    }
  };
  Services.obs.addObserver(beforeShow, "browser-window-before-show");
}
