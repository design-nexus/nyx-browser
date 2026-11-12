/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The top bar's order, its sidebar button, and the QR button. The order comes from the toolbar's
 * own placements, so customizing it still works. Zen moves buttons between containers depending
 * on the layout, so each button carries its position as a style instead of relying on where it is
 * in the document. */
{
  const CUI = window.CustomizableUI;
  const NAVBAR = CUI.AREA_NAVBAR;
  const ARRANGED = "nyx.toolbar.arranged";
  const SIDEBAR_BUTTON = "nyx-sidebar-button";
  const PASSWORDS = "nyx-passwords_design-nexus_github_io-browser-action";
  const SETTINGS = "nyx-appearance-button";
  const ORDER = [
    "back-button",
    "forward-button",
    "stop-reload-button",
    "urlbar-container",
    "nyx-share-button",
    "nyx-capture-button",
    "nyx-assistant-button",
    PASSWORDS,
    "unified-extensions-button",
    "downloads-button",
    SETTINGS,
  ];

  /** Puts each button where the mockup has it, once per profile. */
  function arrange() {
    let position = 0;
    for (const id of ORDER) {
      if (CUI.getWidget(id)?.provider && (CUI.getPlacementOfWidget(id) || id !== PASSWORDS)) {
        CUI.addWidgetToArea(id, NAVBAR, position++);
      }
    }
    // The address bar takes the spare room now, so the springs either side of it go.
    for (const id of CUI.getWidgetIdsInArea(NAVBAR)) {
      if (CUI.isSpecialWidget(id) || id === "vertical-spacer") {
        CUI.removeWidgetFromArea(id);
      }
    }
  }

  /** Buttons stay in one row, however they're laid out. Firefox's overflow menu measures the
   * toolbar's container, which these layouts dissolve, and would empty the row into its menu. It
   * may have already by now, and turning it off doesn't bring them back. */
  function stopOverflowing() {
    const bar = document.getElementById(NAVBAR);
    const overflow = bar?.overflowable;
    if (overflow && !overflow.nyxStopped) {
      overflow.nyxStopped = true;
      // It sets itself up late and checks on every resize, so it's stopped from answering at all.
      overflow.handleEvent = () => {};
      overflow.observe = () => {};
      try {
        overflow.uninit();
      } catch (error) {
        console.error("nyx: couldn't stop the toolbar overflowing", error);
      }
    }
    bar?.removeAttribute("overflowing");
    const list = document.getElementById("widget-overflow-list");
    if (list && !list.nyxWatched) {
      list.nyxWatched = true;
      new MutationObserver(stopOverflowing).observe(list, { childList: true });
    }
    const horizontal = !Services.prefs.getBoolPref("zen.tabs.vertical", true);
    const topRow = document.getElementById("zen-sidebar-top-buttons-customization-target");
    const navRow = document.getElementById("nav-bar-customization-target");
    for (const item of list ? [...list.children] : []) {
      const area = CUI.getPlacementOfWidget(item.id)?.area;
      item.removeAttribute("overflowedItem");
      item.removeAttribute("cui-anchorid");
      (area === "zen-sidebar-top-buttons" || horizontal ? topRow : navRow).append(item);
    }
  }

  function applyOrder() {
    fitSoon();
    const ids = CUI.getWidgetIdsInArea(NAVBAR).filter(id => !CUI.isSpecialWidget(id) && id !== "vertical-spacer");
    const horizontal = !Services.prefs.getBoolPref("zen.tabs.vertical", true);
    const topRow = document.getElementById("zen-sidebar-top-buttons-customization-target");
    ids.forEach((id, index) => {
      // A button placed while Zen had rearranged the bar can be left out of the window: Firefox can't
      // find the toolbar's container then. The button exists, so it goes in directly.
      let element = document.getElementById(id);
      if (!element?.isConnected || element.closest("#BrowserToolbarPalette")) {
        element = CUI.getWidget(id)?.forWindow(window)?.node;
        if (element) {
          (horizontal ? topRow : document.getElementById("nav-bar-customization-target"))?.append(element);
        }
      }
      if (!element) {
        return;
      }
      element.style.order = String((index + 1) * 10);
      // With horizontal tabs the nav bar holds the address alone; everything else is in the row.
      if (horizontal && id !== "urlbar-container" && element.parentElement !== topRow) {
        topRow?.append(element);
      }
    });
    // With horizontal tabs the address bar's whole toolbar sits between the buttons.
    const address = document.getElementById("urlbar-container");
    if (address) {
      document.getElementById(NAVBAR).style.order = address.style.order;
    }
    // The menu button isn't customizable. It goes just before Settings when Settings is last.
    const menu = document.getElementById("PanelUI-button");
    if (menu) {
      const settings = ids.indexOf(SETTINGS);
      menu.style.order = settings === ids.length - 1 ? String((settings + 1) * 10 - 5) : String((ids.length + 1) * 10);
    }
  }

  const applySoon = () => setTimeout(applyOrder, 0);

  /* ---------- Overflow ----------
   * Firefox's own overflow measures a container these layouts dissolve, so it stays off (above).
   * Instead, when the window is too narrow for the address bar to stay usable, the last action
   * buttons move into More tools at the end of the bar, and come back as room returns. A panel a
   * moved button opens anchors on More tools, as with Firefox's overflow. */
  const URLBAR_MIN = 240;
  const OVERFLOW = "nyx-overflow-button";
  const FIXED = new Set(["back-button", "forward-button", "stop-reload-button", "urlbar-container", SIDEBAR_BUTTON]);

  function actionButtons() {
    return CUI.getWidgetIdsInArea(NAVBAR)
      .filter(id => !CUI.isSpecialWidget(id) && id !== "vertical-spacer" && !FIXED.has(id))
      .map(id => document.getElementById(id))
      .filter(node => node?.isConnected && !node.closest("#BrowserToolbarPalette"));
  }

  function overflowButton() {
    let button = document.getElementById(OVERFLOW);
    if (!button) {
      button = document.createXULElement("toolbarbutton");
      button.id = OVERFLOW;
      button.className = "toolbarbutton-1 chromeclass-toolbar-additional";
      button.setAttribute("type", "menu");
      button.setAttribute("label", "More tools");
      button.setAttribute("tooltiptext", "More tools");
      button.setAttribute("aria-label", "More tools");
      const menu = document.createXULElement("menupopup");
      menu.id = `${OVERFLOW}-menu`;
      menu.addEventListener("popupshowing", fillOverflowMenu);
      button.append(menu);
      document.getElementById("PanelUI-button")?.before(button);
    }
    return button;
  }

  function fillOverflowMenu(event) {
    const menu = event.target;
    menu.replaceChildren();
    for (const node of actionButtons().filter(n => n.hasAttribute("nyx-overflowed"))) {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", node.getAttribute("label") || node.getAttribute("tooltiptext") || node.id);
      const icon = getComputedStyle(node).listStyleImage;
      if (icon && icon !== "none") {
        item.classList.add("menuitem-iconic");
        item.style.listStyleImage = icon;
      }
      item.addEventListener("command", () => {
        const target = node.matches("toolbaritem") ? node.querySelector("toolbarbutton") || node : node;
        target.doCommand();
      });
      menu.append(item);
    }
  }

  function fitToolbar() {
    const urlbar = document.getElementById("urlbar-container");
    if (!urlbar || document.documentElement.hasAttribute("customizing")) {
      return;
    }
    const buttons = actionButtons();
    let room = urlbar.getBoundingClientRect().width - URLBAR_MIN;
    const shown = buttons.filter(node => !node.hasAttribute("nyx-overflowed"));
    for (let i = shown.length - 1; i >= 0 && room < 0; i--) {
      const node = shown[i];
      node.nyxWidth = node.getBoundingClientRect().width + 4;
      node.setAttribute("nyx-overflowed", "true");
      node.setAttribute("cui-anchorid", OVERFLOW);
      room += node.nyxWidth;
    }
    // Back in order, each while it fits with a little to spare, so a resize can't flicker.
    for (const node of buttons.filter(n => n.hasAttribute("nyx-overflowed"))) {
      const width = node.nyxWidth || 36;
      if (room - width < 16) {
        break;
      }
      node.removeAttribute("nyx-overflowed");
      node.removeAttribute("cui-anchorid");
      room -= width;
    }
    const button = overflowButton();
    button.hidden = !buttons.some(node => node.hasAttribute("nyx-overflowed"));
    button.style.order = document.getElementById("PanelUI-button")?.style.order || "";
  }

  let fitting = 0;
  const fitSoon = () => {
    cancelAnimationFrame(fitting);
    fitting = requestAnimationFrame(fitToolbar);
  };

  window.NyxToolbar = { fit: fitToolbar };

  function placePasswords() {
    if (document.getElementById(PASSWORDS) && !Services.prefs.getBoolPref("nyx.toolbar.passwords-placed", false)) {
      Services.prefs.setBoolPref("nyx.toolbar.passwords-placed", true);
      const ids = CUI.getWidgetIdsInArea(NAVBAR);
      const extensions = ids.indexOf("unified-extensions-button");
      CUI.addWidgetToArea(PASSWORDS, NAVBAR, extensions < 0 ? ids.length : extensions);
    }
  }

  const listener = {
    onWidgetAfterCreation: () => {
      placePasswords();
      applySoon();
    },
    onWidgetAdded: applySoon,
    onWidgetMoved: applySoon,
    onWidgetRemoved: applySoon,
    onWidgetAfterDOMChange: applySoon,
  };

  // Registered once per process; every window after the first finds it already there.
  if (!Services.nyxSidebarWidget) {
    Services.nyxSidebarWidget = true;
    CUI.createWidget({
      id: SIDEBAR_BUTTON,
      label: "Sidebar",
      tooltiptext: "Sidebar (Ctrl+B)",
      defaultArea: "zen-sidebar-top-buttons",
      removable: false,
      onCommand(event) {
        event.target.ownerDocument.defaultView.NyxSidebar.toggle();
      },
    });
  }

  /** The QR button: Firefox's own QR dialog, for the page in this tab. */
  function buildQrButton() {
    const star = document.getElementById("star-button-box");
    if (!star || document.getElementById("nyx-qr-button")) {
      return;
    }
    const button = document.createXULElement("hbox");
    button.id = "nyx-qr-button";
    button.className = "urlbar-page-action";
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");
    button.setAttribute("tooltiptext", "Show a QR code for this page");
    button.setAttribute("aria-label", "Show a QR code for this page");
    const icon = document.createXULElement("image");
    icon.className = "urlbar-icon";
    button.append(icon);

    const show = () => {
      const { SharingUtils } = ChromeUtils.importESModule("moz-src:///browser/components/sharing/SharingUtils.sys.mjs");
      button.contextBrowserToShare = Cu.getWeakReference(gBrowser.selectedBrowser);
      SharingUtils.showQRCode(button);
    };
    button.addEventListener("click", event => {
      if (event.button === 0) {
        event.stopPropagation();
        show();
      }
    });
    button.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        show();
      }
    });
    star.before(button);
  }

  /** Firefox won't anchor the Downloads panel to a button whose container has no box of its own,
   * and these layouts dissolve that container. The button itself is what has to be visible. */
  function fixDownloadsAnchor() {
    const original = window.DownloadsButton?._getAnchorInternal;
    if (original) {
      window.DownloadsButton._getAnchorInternal = function () {
        const anchor = original.call(this);
        if (anchor) {
          return anchor;
        }
        const button = document.getElementById("downloads-button");
        const visible = button?.getBoundingClientRect().width > 0;
        return visible && !this._customizing ? window.DownloadsIndicatorView.indicatorAnchor : null;
      };
    }
  }

  const startupDone = (subject, topic) => {
    if (subject !== window) {
      return;
    }
    Services.obs.removeObserver(startupDone, topic);
    fixDownloadsAnchor();
    if (!Services.prefs.getBoolPref(ARRANGED, false)) {
      Services.prefs.setBoolPref(ARRANGED, true);
      arrange();
    }
    stopOverflowing();
    stopOverflowing();
    // Firefox finishes setting up its overflow menu after this, on its own schedule.
    for (const delay of [100, 500, 1500, 4000]) {
      setTimeout(() => {
        stopOverflowing();
        applyOrder();
      }, delay);
    }
    // Zen re-sorts these containers whenever it rebuilds the toolbars. Answering each time, instead
    // of guessing when it's done, keeps the row as it should be. A pass that moves nothing is quiet.
    let queued = false;
    const watcher = new MutationObserver(() => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          applyOrder();
        });
      }
    });
    for (const id of ["zen-sidebar-top-buttons-customization-target", "nav-bar-customization-target", "zen-overflow-extensions-list"]) {
      const container = document.getElementById(id);
      if (container) {
        watcher.observe(container, { childList: true });
      }
    }
    placePasswords();
    CUI.addListener(listener);
    buildQrButton();
    applyOrder();
    new ResizeObserver(fitSoon).observe(document.getElementById("navigator-toolbox"));
    window.addEventListener("aftercustomization", fitSoon);
    window.addEventListener("aftercustomization", applySoon);
    window.addEventListener("customizationchange", applySoon);
    Services.prefs.addObserver("zen.tabs.vertical", applySoon);
    Services.prefs.addObserver("zen.view.sidebar-expanded", applySoon);
    window.addEventListener(
      "unload",
      () => {
        CUI.removeListener(listener);
        Services.prefs.removeObserver("zen.tabs.vertical", applySoon);
        Services.prefs.removeObserver("zen.view.sidebar-expanded", applySoon);
      },
      { once: true }
    );
  };
  Services.obs.addObserver(startupDone, "browser-delayed-startup-finished");
}
