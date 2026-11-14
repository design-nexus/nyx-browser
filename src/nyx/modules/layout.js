/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser's three layouts, in the pref nyx.layout. They differ only in the window's frame:
 *
 * - studio: the tab sidebar, a header with the address in its middle, and back, forward and
 *   reload over the sidebar beside its button. The bookmarks bar is under the header.
 * - focus: sidebar only. Zen's single toolbar puts the address in the sidebar, the bookmarks bar
 *   becomes a shelf of icons above the tabs, and Downloads, Extensions and the menu sit in the
 *   sidebar's foot.
 * - workbench: tabs in a row of their own above the address bar (zen.tabs.vertical off), the
 *   bookmarks bar under it, and a rail of workspaces and Library beside the page.
 *
 * Each layout is a pair of Zen's prefs, and those prefs choose the layout when they change some
 * other way (Zen's own controls, an old profile): zen.tabs.vertical off is Workbench, and
 * zen.view.use-single-toolbar on is Focus. Buttons a layout moves are put back before Zen lays
 * out the window, and moved again after, so Zen and CustomizableUI find them where they left
 * them. */
{
  const PREF = "nyx.layout";
  const VERTICAL = "zen.tabs.vertical";
  const SINGLE = "zen.view.use-single-toolbar";
  const SHELF_FOLDED = "nyx.bookmarks.shelf-folded";
  const LAYOUTS = {
    studio: { vertical: true, single: false },
    focus: { vertical: true, single: true },
    workbench: { vertical: false, single: false },
  };
  // What a layout moves out of its toolbar: [the id of where it goes, the buttons, in order].
  const MOVED = {
    studio: ["nyx-nav-moved", ["back-button", "forward-button", "stop-reload-button"]],
    focus: ["nyx-foot-moved", ["downloads-button", "unified-extensions-button", "nav-bar-overflow-button", "PanelUI-button"]],
  };
  const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

  const fromZen = () =>
    !Services.prefs.getBoolPref(VERTICAL, true) ? "workbench" : Services.prefs.getBoolPref(SINGLE, false) ? "focus" : "studio";

  /** The layout this window shows. */
  function current() {
    const chosen = Services.prefs.getStringPref(PREF, "studio");
    return chosen in LAYOUTS ? chosen : "studio";
  }

  // ---- The prefs: nyx.layout and Zen's pair follow each other.

  let syncing = false;
  function layoutChosen() {
    if (current() !== "workbench") {
      lastColumn = current();
    }
    const { vertical, single } = LAYOUTS[current()];
    syncing = true;
    try {
      if (Services.prefs.getBoolPref(VERTICAL, true) !== vertical) {
        Services.prefs.setBoolPref(VERTICAL, vertical);
      }
      if (Services.prefs.getBoolPref(SINGLE, false) !== single) {
        Services.prefs.setBoolPref(SINGLE, single);
      }
    } finally {
      syncing = false;
    }
    applySoon();
  }

  // Tabs in a column again after Workbench go back to the layout they were in before it.
  let lastColumn = current() === "workbench" ? "studio" : current();
  function zenChanged() {
    if (syncing) {
      return;
    }
    let layout = fromZen();
    if (layout === "studio" && current() === "workbench") {
      layout = lastColumn;
    }
    if (layout !== current()) {
      Services.prefs.setStringPref(PREF, layout);
    }
  }

  // ---- Buttons a layout moves.

  const xul = (tag, attributes = {}) => {
    const element = document.createElementNS(XUL_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    return element;
  };

  /** Puts a node in place, keeping its state if it's already in the window (moveBefore). */
  const put = (parent, node, before = null) => (node.isConnected ? parent.moveBefore(node, before) : parent.insertBefore(node, before));

  // Each moved button's place before it moved: [button, parent, the node after it].
  let moved = [];

  function putBack() {
    for (const [button, parent, next] of moved.reverse()) {
      parent.moveBefore(button, next?.parentNode === parent ? next : null);
    }
    moved = [];
  }

  function holder(id, place) {
    let box = document.getElementById(id);
    if (!box) {
      // CustomizableUI leaves a toolbar's skipintoolbarset children alone.
      box = xul("hbox", { id, class: "nyx-moved", align: "center", skipintoolbarset: "true", overflows: "false" });
    }
    place(box);
    return box;
  }

  function move(layout) {
    const [id, buttons] = MOVED[layout] ?? [];
    if (!id) {
      return;
    }
    let box;
    if (layout === "studio") {
      // Over the sidebar when it's expanded; with the sidebar collapsed Zen puts its button row
      // at the top bar's start, and they go with it.
      const top = document.getElementById("zen-sidebar-top-buttons");
      box = holder(id, element => element.parentNode !== top && top.append(element));
    } else {
      if (!document.documentElement.hasAttribute("zen-single-toolbar")) {
        return;
      }
      const foot = document.getElementById("zen-sidebar-foot-buttons");
      box = holder(id, element => element.parentNode !== foot && foot.append(element));
    }
    for (const buttonId of buttons) {
      const button = document.getElementById(buttonId);
      if (!button || button.closest("#widget-overflow-list, #customization-palette, toolbarpaletteitem")) {
        continue;
      }
      moved.push([button, button.parentNode, button.nextSibling]);
      box.moveBefore(button, null);
    }
  }

  // ---- Focus: the bookmarks shelf.

  function shelfHead() {
    let head = document.getElementById("nyx-shelf-head");
    if (!head) {
      head = xul("hbox", { id: "nyx-shelf-head", align: "center", role: "button", tabindex: "0", "data-l10n-id": "nyx-bookmarks-shelf" });
      head.append(xul("image", { class: "nyx-shelf-icon" }), xul("label", { class: "nyx-shelf-title", "data-l10n-id": "nyx-bookmarks-shelf-title" }), xul("image", { class: "nyx-shelf-chevron" }));
      const fold = () => Services.prefs.setBoolPref(SHELF_FOLDED, !Services.prefs.getBoolPref(SHELF_FOLDED, false));
      head.addEventListener("click", event => event.button === 0 && fold());
      head.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          fold();
        }
      });
    }
    return head;
  }

  function placeBookmarks(layout) {
    const bar = document.getElementById("PersonalToolbar");
    const container = document.getElementById("zen-appcontent-navbar-container");
    if (!bar || !container) {
      return;
    }
    const head = shelfHead();
    const navBar = document.getElementById("nav-bar");
    // Under Essentials in Browser's own tab list (tablist.js), else under the address.
    const slot = document.getElementById("nyx-tl-shelf");
    if (layout === "focus" && document.documentElement.hasAttribute("zen-single-toolbar") && navBar.closest("#navigator-toolbox")) {
      if (slot && (bar.parentNode !== slot || head.parentNode !== slot)) {
        put(slot, head);
        put(slot, bar);
      } else if (!slot && (head.previousElementSibling !== navBar || head.nextElementSibling !== bar)) {
        put(navBar.parentNode, head, navBar.nextSibling);
        put(head.parentNode, bar, head.nextSibling);
      }
    } else {
      head.remove();
      if (bar.parentNode !== container) {
        put(container, bar);
      }
    }
    document.documentElement.toggleAttribute("nyx-shelf-folded", Services.prefs.getBoolPref(SHELF_FOLDED, false));
  }

  // ---- Workbench: the rail beside the page.

  // Each opens its section of the Library page (library.js).
  const RAIL_TOOLS = [
    ["bookmarks", "nyx-rail-bookmarks", () => window.NyxLibraryUI.open("bookmarks")],
    ["history", "nyx-rail-history", () => window.NyxLibraryUI.open("history")],
    ["reading", "nyx-rail-reading", () => window.NyxLibraryUI.open("reading")],
    ["downloads", "nyx-rail-downloads", () => window.NyxLibraryUI.open("downloads")],
  ];

  function buildRail() {
    const rail = xul("vbox", { id: "nyx-rail", align: "center", role: "toolbar", "data-l10n-id": "nyx-rail" });
    const spaces = xul("vbox", { id: "nyx-rail-spaces", align: "center" });
    const switcher = xul("toolbarbutton", { id: "nyx-rail-switcher", class: "toolbarbutton-1", "aria-haspopup": "menu", "data-l10n-id": "nyx-workspace-menu-button" });
    switcher.addEventListener("command", () => gZenWorkspaces.openWorkspacesMenu(switcher));
    rail.append(spaces, switcher, xul("toolbarseparator"));
    for (const [name, l10n, run] of RAIL_TOOLS) {
      const button = xul("toolbarbutton", { id: `nyx-rail-${name}`, class: "toolbarbutton-1", "data-l10n-id": l10n });
      button.addEventListener("command", run);
      rail.append(button);
    }
    rail.append(xul("spacer", { flex: "1" }));
    const settings = xul("toolbarbutton", { id: "nyx-rail-settings", class: "toolbarbutton-1", "data-l10n-id": "nyx-rail-settings" });
    settings.addEventListener("command", () => openPreferences());
    rail.append(settings);
    return rail;
  }

  function fillSpaces() {
    const spaces = document.getElementById("nyx-rail-spaces");
    if (!spaces || !window.gZenWorkspaces?.getWorkspaces) {
      return;
    }
    const active = gZenWorkspaces.getActiveWorkspace()?.uuid;
    spaces.replaceChildren(
      ...gZenWorkspaces.getWorkspaces().map(workspace => {
        const icon = gZenWorkspaces.getWorkspaceIcon(workspace);
        const label = icon && !icon.endsWith(".svg") ? icon : gZenWorkspaces.workspaceInitial(workspace);
        const button = xul("toolbarbutton", { class: "nyx-rail-space", label, tooltiptext: workspace.name, "aria-label": workspace.name });
        button.toggleAttribute("selected", workspace.uuid === active);
        button.addEventListener("command", () => gZenWorkspaces.changeWorkspace(workspace));
        return button;
      })
    );
  }

  function placeRail(layout) {
    let rail = document.getElementById("nyx-rail");
    if (layout !== "workbench" || window.gZenWorkspaces?.privateWindowOrDisabled) {
      rail?.setAttribute("hidden", "true");
      return;
    }
    if (!rail) {
      rail = buildRail();
      document.getElementById("zen-tabbox-wrapper").prepend(rail);
      window.addEventListener("ZenWorkspacesUIUpdate", fillSpaces);
      window.addEventListener("ZenWorkspaceDataChanged", fillSpaces);
    }
    rail.removeAttribute("hidden");
    fillSpaces();
  }

  // ---- Focus: the sidebar's address shows the site's name, the whole address once you type.

  function showHost() {
    let label = document.getElementById("nyx-host");
    const box = document.querySelector("#urlbar .urlbar-input-box");
    if (!box) {
      return;
    }
    if (!label) {
      label = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
      label.id = "nyx-host";
      label.setAttribute("aria-hidden", "true");
      box.append(label);
    }
    let host = "";
    try {
      const uri = gBrowser.currentURI;
      if (/^https?$/.test(uri.scheme)) {
        host = uri.displayHost.replace(/^www\./, "");
      }
    } catch {
      // No host (about: pages, files): the field shows the address.
    }
    label.textContent = current() === "focus" ? host : "";
  }

  // ---- Studio: the address over the middle of the page, whatever is either side of it.

  function centreAddress() {
    const address = document.getElementById("urlbar-container");
    if (!address) {
      return;
    }
    address.style.marginInlineStart = "";
    if (current() !== "studio" || document.documentElement.hasAttribute("customizing")) {
      return;
    }
    const page = document.getElementById("tabbrowser-tabbox").getBoundingClientRect();
    const box = address.getBoundingClientRect();
    const before = address.previousElementSibling?.getBoundingClientRect().right ?? address.parentElement.getBoundingClientRect().left;
    const after = address.nextElementSibling?.getBoundingClientRect().left ?? address.parentElement.getBoundingClientRect().right;
    const want = page.left + (page.width - box.width) / 2;
    // As near the middle as the buttons either side let it be.
    const left = Math.max(before + 8, Math.min(want, after - 8 - box.width));
    address.style.marginInlineStart = `${Math.round(left - before)}px`;
  }

  // ---- Laying out the window.

  function arrange() {
    const layout = current();
    document.documentElement.setAttribute("nyx-layout", layout);
    const customizing = document.documentElement.hasAttribute("customizing");
    if (!customizing) {
      // Downloads stays in Focus's foot however narrow the sidebar's top row gets.
      const downloads = document.getElementById("downloads-button");
      if (layout === "focus") {
        downloads?.setAttribute("overflows", "false");
      } else {
        downloads?.removeAttribute("overflows");
      }
      move(layout);
    }
    placeBookmarks(customizing ? "" : layout);
    placeRail(layout);
    requestAnimationFrame(centreAddress);
    showHost();
    // Zen gives More tools back to the top bar at its end; it goes before Settings and the menu.
    const more = document.getElementById("nav-bar-overflow-button");
    const settings = document.getElementById("nyx-settings-separator");
    if (more && settings && more.parentNode === settings.parentNode && more.nextElementSibling !== settings) {
      settings.parentNode.moveBefore(more, settings);
    }
  }

  const zenUpdate = gZenVerticalTabsManager._updateEvent;
  gZenVerticalTabsManager._updateEvent = function (options = {}) {
    putBack();
    try {
      return zenUpdate.call(this, options);
    } finally {
      if (!options.forCustomizableMode) {
        arrange();
      }
    }
  };

  let pending = 0;
  function applySoon() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      putBack();
      arrange();
    });
  }

  window.NyxLayout = { current, refresh: applySoon, LAYOUTS: Object.keys(LAYOUTS) };

  // A profile from before the layouts has only Zen's prefs; its layout is what they make.
  if (!Services.prefs.prefHasUserValue(PREF) && fromZen() !== "studio") {
    Services.prefs.setStringPref(PREF, fromZen());
  } else if (fromZen() !== current()) {
    layoutChosen();
  }

  Services.prefs.addObserver(PREF, layoutChosen);
  Services.prefs.addObserver(VERTICAL, zenChanged);
  Services.prefs.addObserver(SINGLE, zenChanged);
  Services.prefs.addObserver(SHELF_FOLDED, applySoon);
  window.addEventListener(
    "unload",
    () => {
      Services.prefs.removeObserver(PREF, layoutChosen);
      Services.prefs.removeObserver(VERTICAL, zenChanged);
      Services.prefs.removeObserver(SINGLE, zenChanged);
      Services.prefs.removeObserver(SHELF_FOLDED, applySoon);
    },
    { once: true }
  );
  document.documentElement.setAttribute("nyx-layout", current());
  window.addEventListener("aftercustomization", applySoon);
  const startupDone = (subject, topic) => {
    if (subject === window) {
      Services.obs.removeObserver(startupDone, topic);
      applySoon();
      gBrowser.addProgressListener({ onLocationChange: (browser, progress) => progress.isTopLevel && showHost() });
      gBrowser.tabContainer.addEventListener("TabSelect", showHost);
      let frame = 0;
      new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(centreAddress);
      }).observe(document.getElementById("nav-bar"));
    }
  };
  Services.obs.addObserver(startupDone, "browser-delayed-startup-finished");
}
