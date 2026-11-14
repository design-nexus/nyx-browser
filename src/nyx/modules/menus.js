/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The right-click menus as the layouts' mockups draw them: a row of icon buttons on top for what's
 * done most with what was clicked (a link, an image, selected text, a tab), then the rest of the
 * menu, each item with its icon. A button runs the menu's own item, which the list then leaves
 * out. The page's own row is Firefox's (back, forward, reload, bookmark). And More tools' tools
 * each have a pin that adds them to the top bar. */
{
  const ICONS = "chrome://browser/content/nyx/icons";
  const XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

  // [icon, the item it runs]: the first that's shown wins; none of a kind shown, no row.
  const STRIPS = {
    contentAreaContextMenu: [
      ["link", () => gContextMenu?.onLink && !gContextMenu.onImage, [["plus", "context-openlinkintab"], ["split", "context-openlinkinsplitview"], ["link", "context-copylink"], ["private", "context-openlinkprivate"]]],
      ["image", () => gContextMenu?.onImage, [["copy", "context-copyimage-contents"], ["download", "context-saveimage"], ["link", "context-copyimage"], ["eye", "context-viewimage"]]],
      ["text", () => gContextMenu?.isTextSelected && !gContextMenu.onTextInput, [["copy", "context-copy"], ["search", "context-searchselect"], ["browser", "context-translate-selection"], ["select", "context-selectall"]]],
    ],
    tabContextMenu: [["tab", () => true, [["reload", "context_reloadTab"], ["copy", "context_duplicateTab"], ["pin", "context_pinTab", "context_unpinTab"], ["close", "context_closeTab"]]]],
  };

  // The rest of the menus' items, with their icons.
  const ITEM_ICONS = {
    "context-openlinkincurrent": "arrow-right", "context-openlinkintab": "plus", "context-openlinkincontainertab": "plus",
    "context-openlink": "browser", "context-openlinkprivate": "private", "context-openlinkinsplitview": "split",
    "context-bookmarklink": "bookmark", "context-savelink": "download", "context-copylink": "link", "context-stripOnShareLink": "link",
    "context-copyemail": "mail", "context-copyphone": "phone", "context-viewimage": "eye", "context-saveimage": "download",
    "context-copyimage-contents": "copy", "context-copyimage": "link", "context-sendimage": "mail", "context-imagetext": "font",
    "context-savepage": "download", "context-bookmarkpage": "star", "context-undo": "undo", "context-cut": "copy", "context-copy": "copy",
    "context-paste": "copy", "context-selectall": "select", "context-searchselect": "search", "context-searchselect-private": "private",
    "context-translate-selection": "browser", "context-take-screenshot": "capture", "context-viewsource": "code", "context-inspect": "code",
    "context-print-selection": "file", "context-ask-chat": "assistant", "context-video-pictureinpicture": "popup",
    "context_reloadTab": "reload", "context_duplicateTab": "copy", "context_pinTab": "pin", "context_unpinTab": "pin",
    "context_toggleMuteTab": "sound", "context_bookmarkTab": "bookmark", "context_closeTab": "close", "context_unloadTab": "moon",
    "context_moveTabToSplitView": "split", "context_openANewTab": "plus", "context_undoCloseTab": "undo", "context_closeOtherTabs": "close",
    "context_reopenInContainer": "browser", "context_sendTabToDevice": "share",
  };

  function strip(popup) {
    let row = popup.querySelector(":scope > .nyx-menu-strip");
    if (!row) {
      row = document.createElementNS(XUL, "menugroup");
      row.className = "nyx-menu-strip";
      popup.prepend(row);
    }
    return row;
  }

  /** Separators that no longer have items on both sides go. */
  function tidySeparators(popup) {
    let previous = null;
    for (const node of popup.children) {
      if (node.hidden || node.collapsed || node.classList.contains("nyx-menu-strip")) {
        continue;
      }
      if (node.localName === "menuseparator") {
        if (!previous || previous.localName === "menuseparator") {
          node.hidden = true;
          node.setAttribute("nyx-hid", "true");
          continue;
        }
      }
      previous = node;
    }
    if (previous?.localName === "menuseparator") {
      previous.hidden = true;
      previous.setAttribute("nyx-hid", "true");
    }
  }

  function onShowing(popup) {
    for (const [id, glyph] of Object.entries(ITEM_ICONS)) {
      const item = popup.querySelector(`#${id}`);
      if (item && !item.hasAttribute("image")) {
        item.classList.add("menuitem-iconic");
        item.setAttribute("image", `${ICONS}/${glyph}.svg`);
      }
    }
    const row = strip(popup);
    row.replaceChildren();
    const kind = STRIPS[popup.id].find(([, applies]) => applies());
    if (!kind) {
      row.hidden = true;
      return;
    }
    const buttons = [];
    for (const [glyph, ...ids] of kind[2]) {
      const item = ids.map(id => document.getElementById(id)).find(node => node && !node.hidden);
      if (!item) {
        continue;
      }
      const button = document.createElementNS(XUL, "menuitem");
      button.className = "menuitem-iconic nyx-menu-strip-item";
      button.setAttribute("image", `${ICONS}/${glyph}.svg`);
      // Fluent menus often have no label= attribute yet; prefer the live .label property.
      const label = item.label || item.getAttribute("label") || item.getAttribute("aria-label") || "";
      button.setAttribute("tooltiptext", label);
      button.setAttribute("aria-label", label);
      button.toggleAttribute("disabled", item.disabled);
      button.addEventListener("command", () => item.doCommand());
      buttons.push(button);
      item.hidden = true;
      item.setAttribute("nyx-hid", "true");
    }
    row.append(...buttons);
    if (popup.id === "tabContextMenu") {
      shapeTabMenu(popup);
    }
    row.hidden = buttons.length < 2;
    if (row.hidden) {
      for (const node of popup.querySelectorAll("[nyx-hid]")) {
        node.hidden = false;
        node.removeAttribute("nyx-hid");
      }
    }
    tidySeparators(popup);
  }

  // ---- The tab menu, as the mockups have it: new tab, mute; split, workspace, folder, sleep; link,
  // share; close the others, reopen. Firefox's other items leave it while it's open; those for a
  // split, a pinned page, full screen or the reading list stay when they apply.

  const TAB_ITEMS = new Set([
    "nyx-tab-new-below", "context_toggleMuteTab", "context_toggleMuteSelectedTabs", "context_playTab", "context_playSelectedTabs",
    "context_zenSplitTabs", "context_separateSplitView", "context_reverseSplitView", "nyx-tab-move-space", "context_zenMoveToFolder",
    "context_unloadTab", "nyx-tab-reading-list", "nyx-tab-copy-link", "nyx-tab-close-others", "context_undoCloseTab",
    "context_zen-remove-essential", "context_zen-edit-pinned-page", "context_zen-reset-pinned-tab", "context_fullscreenAutohide", "context_fullscreenExit",
  ]);

  function tabItem(id, l10nId, glyph, run, before) {
    let item = document.getElementById(id);
    if (!item) {
      item = document.createXULElement("menuitem");
      item.id = id;
      item.className = "menuitem-iconic";
      item.setAttribute("image", `${ICONS}/${glyph}.svg`);
      document.l10n.setAttributes(item, l10nId);
      item.addEventListener("command", () => run(TabContextMenu.contextTab));
      before.before(item);
    }
    return item;
  }

  function fillSpaces(popup, tab) {
    popup.replaceChildren();
    const head = document.createXULElement("menucaption");
    document.l10n.setAttributes(head, "nyx-tab-move-to");
    popup.append(head);
    for (const space of gZenWorkspaces.getWorkspaces() ?? []) {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", space.name);
      item.disabled = space.uuid === gZenWorkspaces.activeWorkspace;
      item.addEventListener("command", () => gZenWorkspaces.moveTabToWorkspace(tab, space.uuid));
      popup.append(item);
    }
    popup.append(document.createXULElement("menuseparator"));
    const add = document.createXULElement("menuitem");
    document.l10n.setAttributes(add, "nyx-tab-new-space");
    add.addEventListener("command", () => document.getElementById("cmd_zenOpenWorkspaceCreation")?.doCommand());
    popup.append(add);
  }

  function shapeTabMenu(popup) {
    const tab = TabContextMenu.contextTab;
    const mute = document.getElementById("context_toggleMuteTab");
    tabItem("nyx-tab-new-below", "nyx-tab-new-below", "plus", t => (gBrowser.addAdjacentNewTab ? gBrowser.addAdjacentNewTab(t) : BrowserCommands.openTab()), mute);
    let move = document.getElementById("nyx-tab-move-space");
    if (!move) {
      move = document.createXULElement("menu");
      move.id = "nyx-tab-move-space";
      move.className = "menu-iconic";
      move.setAttribute("image", `${ICONS}/grid.svg`);
      document.l10n.setAttributes(move, "nyx-tab-move-space");
      const spaces = document.createXULElement("menupopup");
      spaces.addEventListener("popupshowing", event => event.target === spaces && fillSpaces(spaces, TabContextMenu.contextTab));
      move.append(spaces);
      document.getElementById("context_zenMoveToFolder").before(move);
    }
    move.hidden = !!(tab?.hasAttribute("zen-essential") || gZenWorkspaces.privateWindowOrDisabled || (gZenWorkspaces.getWorkspaces()?.length ?? 0) < 2);
    const reopen = document.getElementById("context_undoCloseTab");
    const link = tabItem("nyx-tab-copy-link", "nyx-tab-copy-link", "link", t => {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(t.linkedBrowser.currentURI.displaySpec);
    }, reopen);
    link.hidden = !/^(https?|file):/.test(tab?.linkedBrowser.currentURI.spec ?? "");
    const others = tabItem("nyx-tab-close-others", "nyx-tab-close-others", "close", t => gBrowser.removeAllTabsBut(t), reopen);
    others.hidden = gBrowser.visibleTabs.filter(t => !t.pinned).length < 2;
    // The mockups' order, groups between lines; what isn't listed follows, as Firefox has it.
    const byId = id => document.getElementById(id);
    const shareItem = [...popup.children].find(node => node.getAttribute("data-l10n-id") === "tab-context-share-url");
    const groups = [
      ["nyx-tab-new-below", "context_toggleMuteTab", "context_toggleMuteSelectedTabs", "context_playTab", "context_playSelectedTabs"],
      ["context_zenSplitTabs", "context_separateSplitView", "context_reverseSplitView", "nyx-tab-move-space", "context_zenMoveToFolder", "context_unloadTab"],
      ["nyx-tab-reading-list", "nyx-tab-copy-link", shareItem],
      ["nyx-tab-close-others", "context_undoCloseTab"],
    ];
    popup.querySelectorAll(":scope > .nyx-tab-separator").forEach(line => line.remove());
    let at = popup.querySelector(":scope > .nyx-menu-strip");
    groups.forEach((group, i) => {
      if (i) {
        const line = document.createXULElement("menuseparator");
        line.className = "nyx-tab-separator";
        at.after(line);
        at = line;
      }
      for (const entry of group) {
        const node = typeof entry === "string" ? byId(entry) : entry;
        if (node) {
          at.after(node);
          at = node;
        }
      }
    });
    for (const node of popup.children) {
      const share = node.getAttribute("data-l10n-id") === "tab-context-share-url";
      const keep = TAB_ITEMS.has(node.id) || share || node.localName === "menuseparator" || node.classList.contains("nyx-menu-strip");
      if (!keep && !node.hidden) {
        node.hidden = true;
        node.setAttribute("nyx-hid", "true");
      }
    }
  }

  function onHidden(event) {
    if (event.target !== event.currentTarget) {
      return;
    }
    // Firefox decides what's shown again next time; what this hid comes back for it to decide.
    for (const node of event.target.querySelectorAll("[nyx-hid]")) {
      node.hidden = false;
      node.removeAttribute("nyx-hid");
    }
  }

  // ---- More tools: each tool has a pin that puts it in the top bar (right-click on a button in
  // the bar puts it back, as Firefox's Pin to Overflow Menu).

  function addPins() {
    for (const button of document.querySelectorAll("#widget-overflow-fixed-list > toolbarbutton[id]")) {
      if (button.querySelector(":scope > .nyx-pin-to-bar")) {
        continue;
      }
      const pin = document.createElementNS(XUL, "image");
      pin.className = "nyx-pin-to-bar";
      pin.setAttribute("role", "button");
      document.l10n.setAttributes(pin, "nyx-pin-to-bar");
      const add = event => {
        event.preventDefault();
        event.stopPropagation();
        if (event.type !== "click") {
          return;
        }
        const nav = CustomizableUI.getWidgetIdsInArea(CustomizableUI.AREA_NAVBAR);
        const at = nav.indexOf("downloads-button");
        CustomizableUI.addWidgetToArea(button.id, CustomizableUI.AREA_NAVBAR, at >= 0 ? at : undefined);
        document.getElementById("widget-overflow")?.hidePopup();
      };
      for (const type of ["mousedown", "mouseup", "click", "command"]) {
        pin.addEventListener(type, add, true);
      }
      button.append(pin);
    }
  }
  document.getElementById("widget-overflow")?.addEventListener("popupshowing", addPins);
  // A tool that leaves More tools leaves its pin behind; in the bar, right-click moves it back.
  CustomizableUI.addListener({
    onWidgetAfterDOMChange(node) {
      if (!node.closest?.("#widget-overflow-fixed-list")) {
        node.querySelector?.(":scope > .nyx-pin-to-bar")?.remove();
      }
    },
  });

  // ---- The menu: tiles for a new window, a private one, Library, Capture, Assistant and Quick
  // commands across its top, as the mockups have it; the rest is Firefox's list.

  const TILES = [
    ["browser", "nyx-appmenu-new-window", () => OpenBrowserWindow()],
    ["private", "nyx-appmenu-private", () => OpenBrowserWindow({ private: true })],
    ["history", "nyx-appmenu-library", () => window.NyxLibraryUI.open("history")],
    ["capture", "nyx-appmenu-capture", () => document.getElementById("nyx-capture-button")?.doCommand()],
    ["assistant", "nyx-appmenu-assistant", () => document.getElementById("nyx-assistant-button")?.doCommand()],
    ["command", "nyx-appmenu-commands", () => window.NyxQuickCommands?.open()],
  ];
  // The list under the tiles, in the mockups' order; "-" is a line. Firefox's other items aren't in it.
  const MENU_ORDER = [
    "appMenu-zoom-controls",
    "appMenu-find-button2",
    "nyx-appmenu-reader",
    "appMenu-translate-button",
    "appMenu-print-button2",
    "appMenu-save-file-button2",
    "-",
    "nyx-appmenu-customize",
    "appMenu-settings-button",
    "nyx-appmenu-extensions",
    "appMenu-help-button2",
    "-",
    "appMenu-quit-button2",
  ];

  function menuButton(id, l10nId, glyph, run) {
    const button = document.createXULElement("toolbarbutton");
    button.id = id;
    button.className = "subviewbutton";
    button.setAttribute("image", `${ICONS}/${glyph}.svg`);
    document.l10n.setAttributes(button, l10nId);
    button.addEventListener("command", () => {
      PanelUI.hide();
      run();
    });
    return button;
  }

  // About Browser is a page of Settings, not Zen's dialog.
  window.openAboutDialog = () => openPreferences("paneNyxAbout");

  // Help: Browser's keyboard shortcuts first; Firefox fills the rest each time it opens (its
  // troubleshooting and report items are hidden, nyx.css), and About opens Browser's About.
  const helpView = PanelMultiView.getViewNode(document, "PanelUI-helpView");
  helpView?.addEventListener("ViewShowing", () => {
    const items = helpView.querySelector("#PanelUI-helpItems");
    if (items && !items.querySelector("#nyx-help-keys")) {
      items.prepend(menuButton("nyx-help-keys", "nyx-help-keys", "command", () => openPreferences("paneNyxGestures-keys")));
    }
  });

  function arrangeMenu(body) {
    if (!document.getElementById("nyx-appmenu-reader")) {
      body.append(
        menuButton("nyx-appmenu-reader", "nyx-appmenu-reader", "reader", () => document.getElementById("View:ReaderView")?.doCommand()),
        menuButton("nyx-appmenu-customize", "nyx-appmenu-customize", "settings", () => gCustomizeMode.enter()),
        menuButton("nyx-appmenu-extensions", "nyx-appmenu-extensions", "puzzle", () => openTrustedLinkIn("about:extensions", "tab"))
      );
    }
    const kept = [];
    for (const id of MENU_ORDER) {
      if (id === "-") {
        const line = document.createXULElement("toolbarseparator");
        line.className = "nyx-appmenu-line";
        kept.push(line);
      } else {
        const node = document.getElementById(id);
        if (node) {
          kept.push(node);
        }
      }
    }
    for (const node of body.children) {
      if (node.id !== "nyx-appmenu-tiles" && node.id !== "appMenu-update-banner" && !kept.includes(node)) {
        node.setAttribute("nyx-appmenu-hidden", "true");
      }
    }
    body.querySelectorAll(".nyx-appmenu-line").forEach(line => line.remove());
    body.append(...kept);
  }
  const HTML = "http://www.w3.org/1999/xhtml";

  function addTiles(view) {
    const body = view.querySelector(".panel-subview-body");
    if (!body || body.querySelector("#nyx-appmenu-tiles")) {
      return;
    }
    const grid = document.createElementNS(HTML, "div");
    grid.id = "nyx-appmenu-tiles";
    for (const [glyph, l10nId, run] of TILES) {
      const tile = document.createElementNS(HTML, "button");
      tile.className = "nyx-appmenu-tile";
      const img = document.createElementNS(HTML, "img");
      img.src = `${ICONS}/${glyph}.svg`;
      img.alt = "";
      const text = document.createElementNS(HTML, "span");
      document.l10n.setAttributes(text, l10nId);
      tile.append(img, text);
      tile.addEventListener("click", () => {
        PanelUI.hide();
        run();
      });
      grid.append(tile);
    }
    body.prepend(grid);
    arrangeMenu(body);
  }
  document.getElementById("appMenu-popup")?.addEventListener("ViewShowing", event => event.target.id === "appMenu-mainView" && addTiles(event.target));

  for (const id of Object.keys(STRIPS)) {
    const popup = document.getElementById(id);
    // After Firefox's own handlers have chosen the items.
    popup?.addEventListener("popupshowing", event => event.target === popup && setTimeout(() => onShowing(popup), 0));
    popup?.addEventListener("popuphidden", onHidden);
  }
}
