/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Open in, in a window: Alt+Shift+O opens the page in the browser last chosen, links and tabs
 * have Open in rows in their menus, and a site set to always open elsewhere does so when a page
 * of it starts loading here (not when a session brings it back, or on reload). */
{
  const { NyxOpenIn } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxOpenIn.sys.mjs");
  const { AboutNewTab } = ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs");

  window.addEventListener(
    "keydown",
    event => {
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === "KeyO") {
        event.preventDefault();
        event.stopPropagation();
        NyxOpenIn.openPreferred(NyxOpenIn.webAddress(gBrowser.currentURI));
      }
    },
    true
  );

  /** "Open link in Firefox", then "Open link in" with the other browsers, after `anchor`. */
  async function addRows(popup, anchor, prefix, url, hidden) {
    const own = popup.querySelectorAll(`.${prefix}`);
    own.forEach(node => node.remove());
    if (hidden) {
      return;
    }
    const list = await NyxOpenIn.list();
    const preferred = NyxOpenIn.preferred(list);
    if (!preferred) {
      return;
    }
    const first = document.createXULElement("menuitem");
    first.className = `${prefix} menuitem-iconic`;
    first.setAttribute("image", NyxOpenIn.icon(preferred));
    document.l10n.setAttributes(first, `${prefix}-preferred`, { name: preferred.name });
    first.addEventListener("command", () => NyxOpenIn.open(preferred, url));
    const menu = document.createXULElement("menu");
    menu.className = prefix;
    document.l10n.setAttributes(menu, `${prefix}-other`);
    const sub = document.createXULElement("menupopup");
    for (const browser of list) {
      const item = document.createXULElement("menuitem");
      item.className = "menuitem-iconic";
      item.setAttribute("image", NyxOpenIn.icon(browser));
      item.setAttribute("label", browser.name);
      item.addEventListener("command", () => NyxOpenIn.open(browser, url));
      sub.append(item);
      if (browser.private) {
        const privately = document.createXULElement("menuitem");
        privately.className = "menuitem-iconic";
        privately.setAttribute("image", "chrome://browser/content/nyx/icons/private.svg");
        document.l10n.setAttributes(privately, "nyx-openin-private-item", { name: browser.name });
        privately.addEventListener("command", () => NyxOpenIn.open(browser, url, { privately: true }));
        sub.append(privately);
      }
    }
    menu.append(sub);
    anchor.after(first, menu);
  }

  const pageMenu = document.getElementById("contentAreaContextMenu");
  pageMenu?.addEventListener("popupshowing", event => {
    if (event.target !== pageMenu) {
      return;
    }
    const url = gContextMenu?.onLink ? NyxOpenIn.webAddress(Services.io.newURI(gContextMenu.linkURL)) : null;
    const anchor = document.getElementById("context-openlinkprivate");
    addRows(pageMenu, anchor, "nyx-openin-link", url, !url || !anchor);
  });

  const tabMenu = document.getElementById("tabContextMenu");
  tabMenu?.addEventListener("popupshowing", event => {
    if (event.target !== tabMenu) {
      return;
    }
    const tab = TabContextMenu.contextTab;
    const url = tab && NyxOpenIn.webAddress(tab.linkedBrowser.currentURI);
    const anchor = document.getElementById("context_duplicateTab");
    addRows(tabMenu, anchor, "nyx-openin-tab", url, !url || !anchor);
  });

  // Sites that always open elsewhere: the load stops here and goes there. A tab that had nothing
  // else to show closes.
  const STATE = Ci.nsIWebProgressListener;
  const HISTORY = Ci.nsIDocShell.LOAD_CMD_HISTORY;
  const RELOAD = Ci.nsIDocShell.LOAD_CMD_RELOAD;
  const listener = {
    onStateChange(browser, webProgress, request, flags) {
      if (
        !webProgress.isTopLevel ||
        !(flags & STATE.STATE_START) ||
        !(flags & STATE.STATE_IS_DOCUMENT) ||
        webProgress.loadType & (HISTORY | RELOAD) ||
        !(request instanceof Ci.nsIChannel)
      ) {
        return;
      }
      const url = NyxOpenIn.webAddress(request.URI);
      const id = url && NyxOpenIn.siteRule(request.URI.host);
      if (!id) {
        return;
      }
      // The parent's stand-in for a remote tab's request can't be cancelled; the tab can stop.
      browser.stop();
      NyxOpenIn.list().then(list => {
        const target = list.find(b => b.id === id);
        if (!target) {
          return;
        }
        NyxOpenIn.open(target, url);
        const tab = gBrowser.getTabForBrowser(browser);
        const spec = browser.currentURI.spec;
        const empty = !browser.canGoBack && ["about:blank", "about:newtab", "about:home", AboutNewTab.newTabURL].includes(spec);
        if (tab && empty && !tab.pinned) {
          gBrowser.removeTab(tab);
        }
      });
    },
  };
  gBrowser.addTabsProgressListener(listener);
  window.addEventListener("unload", () => gBrowser.removeTabsProgressListener(listener), { once: true });
}
