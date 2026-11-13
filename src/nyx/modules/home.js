/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser's home is its dashboard, the Nyx extension's new tab page: HomePage.get answers it for
 * new windows and the Home button. A window's first tab can open before the extension has said
 * where its page is, and a session can bring back Firefox's home page; a tab that arrives at
 * about:home or about:newtab goes on to the dashboard, in place of it. */
{
  const HOME_PAGES = new Set(["about:home", "about:newtab"]);
  const { AboutNewTab } = ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs");

  function goHome(browser) {
    if (!AboutNewTab.newTabURLOverridden || !HOME_PAGES.has(browser.currentURI.spec)) {
      return;
    }
    if (gBrowser.getTabForBrowser(browser)?.hasAttribute("zen-empty-tab")) {
      return;
    }
    browser.fixupAndLoadURIString(AboutNewTab.newTabURL, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
    });
  }

  const listener = {
    onLocationChange(browser, webProgress) {
      if (webProgress.isTopLevel) {
        goHome(browser);
      }
    },
  };
  const urlChanged = () => gBrowser.browsers.forEach(goHome);

  gBrowser.addTabsProgressListener(listener);
  Services.obs.addObserver(urlChanged, "newtab-url-changed");
  window.addEventListener(
    "unload",
    () => {
      gBrowser.removeTabsProgressListener(listener);
      Services.obs.removeObserver(urlChanged, "newtab-url-changed");
    },
    { once: true }
  );
  urlChanged();
}
