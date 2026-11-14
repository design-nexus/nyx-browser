/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Settings › Tabs & Sidebar's choices that Firefox and Zen don't have: going to the tab on the
 * left after closing one, pinning or unloading a tab with a double click, when tabs show their
 * close buttons, and unloading background tabs after a while. The rest are Firefox's and Zen's
 * own prefs, set by the pane. */
{
  const LEFT = "nyx.tabs.select-left-on-close";
  const DOUBLE_CLICK = "nyx.tabs.double-click";
  const CLOSE_BUTTONS = "nyx.tabs.close-buttons";
  const OVERFLOW = "nyx.tabs.overflow";
  const UNLOAD_AFTER = "nyx.tabs.unload-after";
  const UNLOAD_PINNED = "nyx.tabs.unload-pinned";

  // Closing a tab: the visible tab before it, among those Zen would switch to.
  const findTabToBlurTo = gBrowser._findTabToBlurTo;
  gBrowser._findTabToBlurTo = function (tab, excludeTabs = []) {
    if (Services.prefs.getBoolPref(LEFT, false) && tab?.selected) {
      const excluded = new Set(excludeTabs);
      const left = this.tabContainer.findNextTab(tab, {
        direction: -1,
        filter: other =>
          other !== tab &&
          !excluded.has(other) &&
          !other.closing &&
          !other.hidden &&
          gZenWorkspaces._shouldChangeToTab(other),
      });
      if (left) {
        return gZenWorkspaces.findTabToBlur(left);
      }
    }
    return findTabToBlurTo.call(this, tab, excludeTabs);
  };

  gBrowser.tabContainer.addEventListener("dblclick", event => {
    const tab = event.target.closest?.(".tabbrowser-tab");
    const action = Services.prefs.getStringPref(DOUBLE_CLICK, "");
    if (!tab || !action || event.button !== 0 || event.target.closest(".tab-close-button")) {
      return;
    }
    if (action === "pin") {
      tab.pinned ? gBrowser.unpinTab(tab) : gBrowser.pinTab(tab);
    } else if (action === "unload") {
      gBrowser.explicitUnloadTabs([tab]);
    }
  });

  const showCloseButtons = () =>
    document.documentElement.setAttribute("nyx-tab-close", Services.prefs.getStringPref(CLOSE_BUTTONS, "hover"));
  showCloseButtons();

  // Tabs in a row that don't fit (horizontal-tabs.css): they shrink, or the row scrolls. A
  // scrolling row keeps the tab you're on in sight.
  const showOverflow = () =>
    document.documentElement.setAttribute("nyx-tab-overflow", Services.prefs.getStringPref(OVERFLOW, "shrink"));
  showOverflow();
  gBrowser.tabContainer.addEventListener("TabSelect", ({ target: tab }) => {
    if (!Services.prefs.getBoolPref("zen.tabs.vertical", true) && !tab.pinned && !tab.hasAttribute("zen-essential")) {
      tab.closest("arrowscrollbox")?.ensureElementIsVisible(tab);
    }
  });

  /** Unloads tabs left in the background longer than Settings says, as Firefox's Unload tab does. */
  function unloadIdle() {
    const minutes = Services.prefs.getIntPref(UNLOAD_AFTER, 0);
    if (minutes <= 0) {
      return;
    }
    const before = Date.now() - minutes * 60_000;
    const pinnedToo = Services.prefs.getBoolPref(UNLOAD_PINNED, false);
    for (const tab of gBrowser.tabs) {
      if (
        tab.selected ||
        tab.closing ||
        tab.hasAttribute("pending") ||
        !tab.linkedPanel ||
        tab.soundPlaying ||
        tab.linkedBrowser.docShellIsActive ||
        tab.lastAccessed > before ||
        (tab.pinned && !pinnedToo)
      ) {
        continue;
      }
      gBrowser.discardBrowser(tab);
    }
  }
  const timer = setInterval(unloadIdle, 60_000);

  Services.prefs.addObserver(CLOSE_BUTTONS, showCloseButtons);
  Services.prefs.addObserver(OVERFLOW, showOverflow);
  window.addEventListener(
    "unload",
    () => {
      clearInterval(timer);
      Services.prefs.removeObserver(CLOSE_BUTTONS, showCloseButtons);
      Services.prefs.removeObserver(OVERFLOW, showOverflow);
    },
    { once: true }
  );
}
