/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The Library is a page, about:library (NyxAbout.sys.mjs): every way to Firefox's Library window
 * (its keys, menus, the Workbench rail, Quick Commands) opens the page instead, in this window's
 * Library tab if it has one. A tab's menu saves its page to the reading list. */
{
  const { NyxLibrary } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxLibrary.sys.mjs");
  // Firefox's Library window's sections, as the page's.
  const SECTIONS = {
    History: "history",
    Downloads: "downloads",
    AllBookmarks: "bookmarks",
    BookmarksToolbar: "bookmarks",
    BookmarksMenu: "bookmarks",
    UnfiledBookmarks: "bookmarks",
    Tags: "bookmarks",
  };

  // The addresses each page also answers to (NyxAbout.sys.mjs).
  const ALIASES = { "about:library": ["about:library", "about:downloads", "about:firefoxview"], "about:extensions": ["about:extensions", "about:addons"] };

  /** The page's window once it has loaded, as Firefox's add-ons manager gives its own: Firefox's
   * prompts (an extension added by another program, an update asking for more) sit on its tab. */
  function loaded(browser, names) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const page = browser.contentWindow;
        if (page?.document.readyState === "complete" && names.some(name => page.location.href.startsWith(name))) {
          resolve(page);
        } else if (Date.now() - start > 10000) {
          reject(new Error(`${names[0]} didn't load`));
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  /** Opens one of Browser's pages at `section`, in this window's tab of it if it has one. */
  function openPage(url, section) {
    const names = ALIASES[url] ?? [url];
    let tab = gBrowser.tabs.find(t => names.some(name => t.linkedBrowser.currentURI.spec.startsWith(name)));
    if (!tab) {
      tab = gBrowser.addTrustedTab(`${url}#${section}`);
      gBrowser.selectedTab = tab;
      return loaded(tab.linkedBrowser, names);
    }
    gBrowser.selectedTab = tab;
    const page = tab.linkedBrowser.contentWindow;
    if (page && page.location.hash !== `#${section}`) {
      page.location.hash = section;
    }
    return loaded(tab.linkedBrowser, names);
  }
  const openLibrary = (section = "history") => openPage("about:library", section).catch(console.error);

  // The Extensions page is Browser's (about:extensions, and about:addons too: NyxAbout), with
  // every view of Firefox's add-ons manager: lists, an extension's page and its options, shortcuts.
  // Its discovery pane is the add-ons site.
  BrowserAddonUI.openAddonsMgr = view => {
    if (view?.startsWith("addons://discover")) {
      openTrustedLinkIn(Services.urlFormatter.formatURLPref("extensions.getAddons.link.url"), "tab");
      return Promise.resolve(null);
    }
    let section = "extensions";
    if (view?.startsWith("addons://list/theme")) {
      section = "themes";
    } else if (view?.startsWith("addons://list/plugin")) {
      section = "plugins";
    } else if (view?.startsWith("addons://shortcuts")) {
      section = "shortcuts";
    } else if (view?.startsWith("addons://detail/")) {
      section = `detail/${view.slice("addons://detail/".length)}`;
    }
    return openPage("about:extensions", section);
  };

  // Firefox's history and bookmarks sidebars (Ctrl+H, its menus) are the Library's sections too.
  const SIDEBARS = { viewHistorySidebar: "history", viewBookmarksSidebar: "bookmarks" };
  for (const name of ["toggle", "show", "_show"]) {
    const original = SidebarController[name];
    SidebarController[name] = function (commandID, ...rest) {
      if (SIDEBARS[commandID]) {
        openLibrary(SIDEBARS[commandID]);
        return Promise.resolve();
      }
      return original.call(this, commandID, ...rest);
    };
  }

  PlacesCommandHook.showPlacesOrganizer = item => openLibrary(SECTIONS[Array.isArray(item) ? item[0] : item] ?? "bookmarks");
  BrowserCommands.downloadsUI = () => openLibrary("downloads");
  window.NyxLibraryUI = { open: openLibrary };
  NyxLibrary.removeFirefoxBookmarks();

  // ---- A tab's menu: save its page to the reading list.

  const menu = document.getElementById("tabContextMenu");
  const item = document.createXULElement("menuitem");
  item.id = "nyx-tab-reading-list";
  document.l10n.setAttributes(item, "nyx-tab-reading-list");
  document.getElementById("context_bookmarkTab")?.after(item);
  menu.addEventListener("popupshowing", event => {
    if (event.target === menu) {
      const tab = TabContextMenu.contextTab;
      item.hidden = !tab || !/^https?:/.test(tab.linkedBrowser.currentURI.spec);
    }
  });
  item.addEventListener("command", async () => {
    const browser = TabContextMenu.contextTab.linkedBrowser;
    const [folder] = await document.l10n.formatValues([{ id: "nyx-library-reading-folder" }]);
    await NyxLibrary.saveToReadingList(browser.currentURI.spec, browser.contentTitle || browser.currentURI.spec, folder);
    ConfirmationHint.show(gBrowser.getTabForBrowser(browser), "nyx-reading-list-saved");
  });
}
