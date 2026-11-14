/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser's own tab list in the sidebar, drawn as the layouts' mockups have it: the workspace's
 * header, Essentials as tiles, pinned tabs and folders, Today's tabs and split views, then New tab.
 * Zen's tab strip stays where it is, hidden under this one: its tabs are Firefox's real ones, and
 * workspaces, Essentials, folders, split views and session restore keep working on them. This list
 * only draws them and passes every click, close, drag and right-click on to the real tab, as Zen's
 * Library draws its spaces (ZenLibrarySpacesSection). */
{
  const HTML = "http://www.w3.org/1999/xhtml";
  const DEFAULT_ICON = "chrome://global/skin/icons/defaultFavicon.svg";
  const ICONS = "chrome://browser/content/nyx/icons";
  // What a real tab's attributes say that a row shows.
  const WATCHED = ["label", "image", "selected", "visuallyselected", "pending", "soundplaying", "muted", "pinned", "zen-essential", "collapsed", "busy", "zen-workspace-id", "active", "hidden", "multiselected", "split-view"];
  const strings = new Localization(["browser/nyx-browser.ftl"], true);
  const t = (id, args) => strings.formatValueSync(`nyx-tablist-${id}`, args);

  const el = (tag, cls = "", text = "") => {
    const node = document.createElementNS(HTML, tag);
    if (cls) {
      node.className = cls;
    }
    if (text) {
      node.textContent = text;
    }
    return node;
  };
  const icon = (name, cls = "") => {
    const img = el("img", `nyx-tl-icon ${cls}`);
    img.src = `${ICONS}/${name}.svg`;
    img.alt = "";
    return img;
  };
  /** Icon-only control: focusable button wrapping a glyph. */
  const iconButton = (name, cls, title, onClick) => {
    const btn = el("button", `nyx-tl-icon-btn ${cls}`);
    btn.type = "button";
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.append(icon(name));
    btn.addEventListener("click", event => {
      event.stopPropagation();
      onClick(event);
    });
    return btn;
  };

  const enabled = () => ["studio", "focus"].includes(window.NyxLayout?.current()) && !document.documentElement.hasAttribute("customizing");

  // ---- Rows

  function favicon(tab) {
    const img = el("img", "nyx-tl-fav");
    img.alt = "";
    img.src = tab.getAttribute("image") || DEFAULT_ICON;
    img.addEventListener("error", () => (img.src = DEFAULT_ICON), { once: true });
    return img;
  }

  function closeTab(tab) {
    if (tab.pinned && window.gZenPinnedTabManager?.onCloseTabShortcut) {
      gZenPinnedTabManager.onCloseTabShortcut(null, tab);
    } else {
      gBrowser.removeTab(tab, { animate: true });
    }
  }

  function tabRow(tab, { sub = false } = {}) {
    const row = el("div", "nyx-tl-row nyx-tl-tab");
    row.tab = tab;
    row.draggable = true;
    row.setAttribute("role", "option");
    row.tabIndex = tab.selected ? 0 : -1;
    row.toggleAttribute("selected", tab.selected);
    row.toggleAttribute("multiselected", tab.multiselected);
    row.toggleAttribute("asleep", tab.hasAttribute("pending") && !tab.selected);
    row.toggleAttribute("sub", sub);
    row.toggleAttribute("pinned", tab.pinned);
    row.setAttribute("aria-selected", String(tab.selected));
    row.title = tab.label;
    row.append(favicon(tab), el("span", "nyx-tl-title", tab.label));
    if (tab.hasAttribute("pending") && !tab.selected) {
      const asleep = icon("moon", "nyx-tl-asleep");
      asleep.title = t("asleep");
      row.append(asleep);
    }
    if (tab.soundPlaying || tab.muted) {
      row.append(
        iconButton(tab.muted ? "sound-mute" : "sound", "nyx-tl-sound", tab.muted ? t("unmute") : t("mute"), () => tab.toggleMuteAudio())
      );
    }
    row.append(iconButton("close", "nyx-tl-close", t("close"), () => closeTab(tab)));
    return row;
  }

  function splitRow(group) {
    const row = el("div", "nyx-tl-row nyx-tl-split");
    const tabs = group.tabs ?? [...group.querySelectorAll("tab")];
    row.tab = tabs[0];
    row.toggleAttribute("selected", tabs.some(t => t.selected));
    tabs.forEach((tab, i) => {
      if (i) {
        row.append(el("i", "nyx-tl-bar"));
      }
      const half = el("span", "nyx-tl-half");
      half.tab = tab;
      half.append(favicon(tab), el("span", "nyx-tl-title", tab.label));
      row.append(half);
    });
    return row;
  }

  function folderRows(folder, depth = 0) {
    const rows = [];
    const head = el("div", "nyx-tl-row nyx-tl-folder");
    head.folder = folder;
    head.style.setProperty("--depth", depth);
    head.toggleAttribute("collapsed", folder.collapsed);
    const tabs = (folder.tabs ?? []).filter(t => !t.hasAttribute("zen-empty-tab"));
    const name = el("span", "nyx-tl-title", folder.label || folder.name || undefined);
    if (!name.textContent) {
      document.l10n.setAttributes(name, "nyx-tablist-folder");
    }
    head.append(icon(folder.collapsed ? "folder" : "folder-open", "nyx-tl-folder-icon"), name);
    if (tabs.length) {
      head.append(el("span", "nyx-tl-count", String(tabs.length)));
    }
    rows.push(head);
    const items = folder.allItems ?? [];
    for (const item of items) {
      if (folder.collapsed && !(item.selected || item.hasAttribute?.("folder-active"))) {
        continue;
      }
      rows.push(...itemRows(item, depth + 1));
    }
    return rows;
  }

  function itemRows(item, depth = 0) {
    if (!item || item.hasAttribute?.("zen-empty-tab") || item.hasAttribute?.("zen-glance-tab")) {
      return [];
    }
    if (item.localName === "zen-folder") {
      return folderRows(item, depth);
    }
    if (item.localName === "tab-group" && item.hasAttribute("split-view-group")) {
      const row = splitRow(item);
      row.style.setProperty("--depth", depth);
      return [row];
    }
    if (gBrowser.isTab?.(item) ?? item.localName === "tab") {
      if (item.hidden) {
        return [];
      }
      const row = tabRow(item, { sub: depth > 0 });
      row.style.setProperty("--depth", depth);
      return [row];
    }
    return [];
  }

  // ---- The list

  function header() {
    const workspace = gZenWorkspaces.getActiveWorkspace();
    const box = el("div", "nyx-tl-space");
    box.id = "nyx-tl-space";
    const tile = el("span", "nyx-tl-tile");
    const symbol = workspace ? gZenWorkspaces.getWorkspaceIcon(workspace) : "";
    tile.textContent = symbol && !symbol.endsWith(".svg") ? symbol : workspace ? gZenWorkspaces.workspaceInitial(workspace) : "";
    box.append(tile, el("b", "nyx-tl-space-name", workspace?.name ?? ""), icon("chevron", "nyx-tl-chevron"), el("span", "nyx-tl-grow"));
    const search = el("button", "nyx-tl-btn nyx-tl-search");
    search.type = "button";
    search.title = t("search");
    search.setAttribute("aria-label", t("search"));
    search.append(icon("search"));
    search.addEventListener("click", event => {
      event.stopPropagation();
      gTabsPanel.searchTabs();
    });
    box.append(search);
    box.addEventListener("click", () => gZenWorkspaces.openWorkspacesMenu(box));
    return box;
  }

  function essentials() {
    const tabs = gBrowser.tabs.filter(t => t.hasAttribute("zen-essential") && !t.hidden);
    if (!tabs.length) {
      return null;
    }
    const grid = el("div", "nyx-tl-essentials");
    for (const tab of tabs) {
      const tile = el("div", "nyx-tl-ess");
      tile.tab = tab;
      tile.title = tab.label;
      tile.toggleAttribute("selected", tab.selected);
      tile.toggleAttribute("asleep", tab.hasAttribute("pending") && !tab.selected);
      tile.append(favicon(tab));
      grid.append(tile);
    }
    return grid;
  }

  function today(hasTabs) {
    const label = el("div", "nyx-tl-label");
    label.append(el("i", "nyx-tl-line"), el("span", "", t("today")), el("i", "nyx-tl-line nyx-tl-grow"));
    if (hasTabs) {
      const clear = el("button", "nyx-tl-clear", t("clear"));
      clear.type = "button";
      clear.title = t("clear-title");
      clear.addEventListener("click", () => document.getElementById("cmd_zenCloseUnpinnedTabs")?.doCommand());
      label.append(clear);
    }
    return label;
  }

  function newTabRow() {
    const row = el("div", "nyx-tl-row nyx-tl-new");
    row.setAttribute("role", "option");
    row.append(icon("plus"), el("span", "nyx-tl-title", t("new")));
    const keys = el("span", "nyx-tl-kbd");
    keys.append(el("kbd", "", "Ctrl"), el("kbd", "", "T"));
    row.append(keys);
    row.addEventListener("click", () => BrowserCommands.openTab());
    return row;
  }

  let list = null;
  let scroller = null;
  // Rebuilt on every change: what's above the shelf, and the rest. The shelf between them holds
  // Focus's bookmarks (layout.js), and never moves, so the bookmarks bar isn't rebuilt with it.
  let top = null;
  let shelf = null;
  let body = null;

  function build() {
    list = el("div", "nyx-tablist");
    list.id = "nyx-tablist";
    list.setAttribute("role", "listbox");
    document.l10n.setAttributes(list, "nyx-tablist");
    scroller = el("div", "nyx-tl-scroll");
    top = el("div", "nyx-tl-part");
    shelf = el("div", "nyx-tl-shelf");
    shelf.id = "nyx-tl-shelf";
    body = el("div", "nyx-tl-part");
    scroller.append(top, shelf, body);
    list.append(scroller);
    list.addEventListener("click", onClick);
    list.addEventListener("auxclick", onAuxClick);
    list.addEventListener("dblclick", onDoubleClick);
    list.addEventListener("contextmenu", onContextMenu);
    list.addEventListener("keydown", onKeyDown);
    list.addEventListener("dragstart", onDragStart);
    list.addEventListener("dragover", onDragOver);
    list.addEventListener("dragleave", () => clearDrop());
    list.addEventListener("drop", onDrop);
    list.addEventListener("dragend", () => {
      clearDrop();
      // A drag over the sidebar shows it in compact mode; once it's done, the sidebar can go
      // again unless the pointer is still over it, as after Zen's own drags.
      if (!gNavToolbox.matches(":hover")) {
        gZenCompactModeManager?._setElementExpandAttribute?.(gNavToolbox, false);
      }
    });
    document.querySelector("#TabsToolbar > .toolbar-items").append(list);
    new ResizeObserver(place).observe(document.getElementById("tabbrowser-tabs"));
    window.NyxLayout?.refresh();
  }

  /** Over Zen's tab strip, as big as it is. */
  function place() {
    const tabs = document.getElementById("tabbrowser-tabs").getBoundingClientRect();
    const host = list.parentElement.getBoundingClientRect();
    list.style.top = `${tabs.top - host.top}px`;
    list.style.height = `${tabs.height}px`;
  }

  function render() {
    if (!enabled() || !window.gZenWorkspaces?.activeWorkspaceElement) {
      document.documentElement.removeAttribute("nyx-own-tabs");
      return;
    }
    if (!list) {
      build();
    }
    document.documentElement.setAttribute("nyx-own-tabs", "true");
    const space = gZenWorkspaces.activeWorkspaceElement;
    const ess = essentials();
    const pinned = [...(space.pinnedTabsContainer?.children ?? [])].flatMap(item => itemRows(item));
    const normal = [...(space.tabsContainer?.children ?? [])].flatMap(item => itemRows(item));
    const scrolled = scroller.scrollTop;
    if (window.NyxLayout?.current() === "focus") {
      // Focus: Essentials, the bookmarks shelf, the workspace; New tab heads today's tabs.
      top.replaceChildren(...(ess ? [ess] : []));
      body.replaceChildren(header(), ...pinned, today(normal.length > 0), newTabRow(), ...normal);
    } else {
      top.replaceChildren(header(), ...(ess ? [ess] : []));
      body.replaceChildren(...pinned, today(normal.length > 0), ...normal, newTabRow());
    }
    scroller.scrollTop = scrolled;
    place();
    // The tab you're on stays in sight, as Firefox keeps it in its strip.
    if (selectedChanged) {
      selectedChanged = false;
      scroller.querySelector(".nyx-tl-tab[selected], .nyx-tl-split[selected]")?.scrollIntoView({ block: "nearest" });
    }
  }

  let selectedChanged = true;
  window.addEventListener("TabSelect", () => (selectedChanged = true));

  let pending = 0;
  function renderSoon() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(render);
  }

  // ---- What a click does: always on the real tab.

  const rowOf = event => event.target.closest?.(".nyx-tl-half, .nyx-tl-row, .nyx-tl-ess");

  function onClick(event) {
    if (event.button !== 0) {
      return;
    }
    if (event.target.closest(".nyx-tl-icon-btn, .nyx-tl-clear, .nyx-tl-search")) {
      return;
    }
    const row = rowOf(event);
    if (row?.folder) {
      row.folder.collapsed = !row.folder.collapsed;
      renderSoon();
    } else if (row?.classList.contains("nyx-tl-new")) {
      BrowserCommands.openTab();
    } else if (row?.tab) {
      if (event.ctrlKey || event.metaKey) {
        row.tab.multiselected ? gBrowser.removeFromMultiSelectedTabs(row.tab) : gBrowser.addToMultiSelectedTabs(row.tab);
      } else if (event.shiftKey) {
        gBrowser.addRangeToMultiSelectedTabs(gBrowser.lastMultiSelectedTab ?? gBrowser.selectedTab, row.tab);
      } else {
        gBrowser.clearMultiSelectedTabs();
        gBrowser.selectedTab = row.tab;
      }
    }
  }

  function tabOptions() {
    return [...scroller.querySelectorAll('.nyx-tl-tab[role="option"], .nyx-tl-new[role="option"], .nyx-tl-split[role="option"]')];
  }

  function onKeyDown(event) {
    if (!list.contains(document.activeElement) && document.activeElement !== list) {
      return;
    }
    const options = tabOptions();
    if (!options.length) {
      return;
    }
    const current = document.activeElement?.closest?.('[role="option"]') || options.find(o => o.hasAttribute("selected")) || options[0];
    const index = Math.max(0, options.indexOf(current));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = options[(index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length];
      next.tabIndex = 0;
      options.forEach(o => {
        if (o !== next) {
          o.tabIndex = -1;
        }
      });
      next.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? options[0] : options.at(-1);
      next.tabIndex = 0;
      options.forEach(o => {
        if (o !== next) {
          o.tabIndex = -1;
        }
      });
      next.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (current.classList.contains("nyx-tl-new")) {
        BrowserCommands.openTab();
      } else if (current.tab) {
        gBrowser.selectedTab = current.tab;
      }
    } else if ((event.key === "Delete" || event.key === "Backspace") && current.tab) {
      event.preventDefault();
      closeTab(current.tab);
    }
  }

  function onAuxClick(event) {
    const row = rowOf(event);
    if (event.button === 1 && row?.tab && Services.prefs.getBoolPref("nyx.tabs.middle-click-close", true)) {
      event.preventDefault();
      closeTab(row.tab);
    }
  }

  function onDoubleClick(event) {
    const tab = rowOf(event)?.tab;
    const action = Services.prefs.getStringPref("nyx.tabs.double-click", "");
    if (!tab || event.target.closest(".nyx-tl-close")) {
      return;
    }
    if (action === "pin") {
      tab.pinned ? gBrowser.unpinTab(tab) : gBrowser.pinTab(tab);
    } else if (action === "unload") {
      gBrowser.explicitUnloadTabs([tab]);
    }
  }

  function onContextMenu(event) {
    const row = rowOf(event);
    const real = row?.folder?.querySelector(".tab-group-label-container") ?? row?.tab;
    if (!real) {
      return;
    }
    event.preventDefault();
    const menu = document.getElementById(row.folder ? "zenFolderActions" : "tabContextMenu");
    // Firefox's tab strip loads the tab menu's strings on its first right-click; this list is that strip.
    gBrowser.translateTabContextMenu();
    if (!row.folder && !row.tab.multiselected) {
      gBrowser.clearMultiSelectedTabs();
    }
    const trigger = new MouseEvent("NyxTabListContextMenu", { screenX: event.screenX, screenY: event.screenY });
    real.dispatchEvent(trigger);
    menu.openPopupAtScreen(event.screenX, event.screenY, true, trigger);
  }

  // ---- Drag and drop: moves the real tabs, into a folder, or between pinned and today's.

  const TYPE = "application/x-nyx-tab";
  let dragged = null;
  let dropMark = null;

  function onDragStart(event) {
    const row = rowOf(event);
    if (!row?.tab || row.classList.contains("nyx-tl-ess")) {
      return;
    }
    dragged = row.tab;
    event.dataTransfer.setData(TYPE, String(dragged._tPos));
    event.dataTransfer.effectAllowed = "move";
  }

  function clearDrop() {
    dropMark?.removeAttribute("nyx-drop");
    dropMark = null;
  }

  function dropTarget(event) {
    const row = event.target.closest?.(".nyx-tl-row");
    if (!row || !dragged || (row.tab === dragged && !row.folder)) {
      return null;
    }
    const box = row.getBoundingClientRect();
    if (row.folder) {
      return { row, into: row.folder };
    }
    if (row.classList.contains("nyx-tl-new")) {
      return { row, after: null, end: true };
    }
    return { row, before: event.clientY < box.top + box.height / 2 };
  }

  function onDragOver(event) {
    if (!event.dataTransfer.types.includes(TYPE)) {
      return;
    }
    const target = dropTarget(event);
    clearDrop();
    if (!target) {
      return;
    }
    event.preventDefault();
    dropMark = target.row;
    dropMark.setAttribute("nyx-drop", target.into ? "into" : target.before ? "before" : "after");
  }

  function onDrop(event) {
    const target = dropTarget(event);
    clearDrop();
    const tab = dragged;
    dragged = null;
    if (!target || !tab) {
      return;
    }
    event.preventDefault();
    if (target.into) {
      target.into.addTabs([tab]);
      return;
    }
    if (target.end) {
      if (tab.pinned) {
        gBrowser.unpinTab(tab);
      }
      gBrowser.moveTabTo(tab, { elementIndex: gBrowser.tabs.length - 1 });
      return;
    }
    const other = target.row.tab;
    // Zen keeps a tab in its section when it moves, so it changes section (or folder) first.
    const folder = other.group?.localName === "zen-folder" ? other.group : null;
    if (folder && tab.group !== folder) {
      folder.addTabs([tab]);
    } else if (!folder && tab.group?.localName === "zen-folder") {
      gBrowser.ungroupTab(tab);
    }
    if (other.pinned !== tab.pinned) {
      other.pinned ? gBrowser.pinTab(tab) : gBrowser.unpinTab(tab);
    }
    if (target.before) {
      gBrowser.moveTabBefore(tab, other);
    } else {
      gBrowser.moveTabAfter(tab, other);
    }
  }

  // ---- Keeping up with the real tabs

  for (const type of ["TabOpen", "TabClose", "TabSelect", "TabMove", "TabPinned", "TabUnpinned", "TabAttrModified", "TabGrouped", "TabUngrouped", "TabGroupCreate", "TabGroupRemoved", "TabMultiSelect", "TabAddedToEssentials", "TabRemovedFromEssentials", "ZenFolderRenamed"]) {
    window.addEventListener(type, renderSoon);
  }
  window.addEventListener("ZenWorkspaceDataChanged", renderSoon);
  window.addEventListener("ZenWorkspacesUIUpdate", renderSoon);
  window.addEventListener("aftercustomization", renderSoon);
  window.addEventListener("beforecustomization", renderSoon);
  Services.prefs.addObserver("nyx.layout", renderSoon);
  window.addEventListener("unload", () => Services.prefs.removeObserver("nyx.layout", renderSoon), { once: true });

  const startupDone = (subject, topic) => {
    if (subject !== window) {
      return;
    }
    Services.obs.removeObserver(startupDone, topic);
    gZenWorkspaces.promiseInitialized?.then?.(renderSoon) ?? renderSoon();
    gZenWorkspaces.addChangeListeners?.(renderSoon);
    const strip = document.getElementById("tabbrowser-arrowscrollbox");
    const observer = new MutationObserver(renderSoon);
    for (const node of [strip, document.getElementById("zen-essentials")]) {
      if (node) {
        observer.observe(node, { subtree: true, childList: true, attributes: true, attributeFilter: WATCHED });
      }
    }
    renderSoon();
  };
  Services.obs.addObserver(startupDone, "browser-delayed-startup-finished");

  window.NyxTabList = { render: renderSoon };
}
