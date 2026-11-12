/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The sidebar's parts that Zen doesn't have: the workspace row's menu and tab search, the Folders
 * section, and the foot's workspace icons. They're ordinary elements beside Zen's, and tabs aren't
 * reordered, so dragging tabs is unaffected. */
{
  const xul = (tag, props = {}) => {
    const element = document.createXULElement(tag);
    for (const [name, value] of Object.entries(props)) {
      element.setAttribute(name, value);
    }
    return element;
  };

  /* ---------- Workspace row ---------- */

  function openWorkspaceMenu(anchor) {
    let menu = document.getElementById("nyx-workspace-menu");
    if (!menu) {
      menu = xul("menupopup", { id: "nyx-workspace-menu", position: "after_start" });
      document.getElementById("mainPopupSet").append(menu);
    }
    menu.replaceChildren();
    const current = gZenWorkspaces.activeWorkspace;
    for (const space of gZenWorkspaces.getWorkspaces()) {
      const item = xul("menuitem", { label: space.name, type: "radio" });
      if (space.uuid === current) {
        item.setAttribute("checked", "true");
      }
      item.addEventListener("command", () => gZenWorkspaces.changeWorkspaceWithID(space.uuid));
      menu.append(item);
    }
    menu.append(xul("menuseparator"));
    const create = xul("menuitem", { label: "New workspace" });
    create.addEventListener("command", () => document.getElementById("cmd_zenOpenWorkspaceCreation").doCommand());
    menu.append(create);
    menu.openPopup(anchor, "after_start");
  }

  function fillIndicator(indicator) {
    if (indicator.querySelector(".nyx-workspace-menu-button")) {
      return;
    }
    const chevron = xul("image", { class: "nyx-workspace-menu-button", role: "button", tooltiptext: "Workspaces", "aria-label": "Workspaces" });
    const search = xul("toolbarbutton", { class: "nyx-tab-search toolbarbutton-1", tooltiptext: "Search tabs (Ctrl+Shift+E)", "aria-label": "Search tabs" });
    search.addEventListener("command", () => gTabsPanel.searchTabs());
    indicator.append(chevron, search);
    // The whole row opens the menu. Zen's click collapses the pinned tabs, which the mockup doesn't have.
    indicator.addEventListener(
      "click",
      event => {
        if (event.button === 0 && !event.target.closest(".nyx-tab-search, .zen-workspaces-actions")) {
          event.stopImmediatePropagation();
          openWorkspaceMenu(indicator);
        }
      },
      true
    );
  }

  /* ---------- Folders section ---------- */

  function placeFoldersHeader(section) {
    let header = section.querySelector(":scope > .nyx-folders-header");
    if (!header) {
      header = xul("hbox", { class: "nyx-folders-header", align: "center" });
      const label = xul("label", { class: "nyx-folders-label" });
      label.textContent = "Folders";
      const add = xul("toolbarbutton", { class: "nyx-add toolbarbutton-1", tooltiptext: "New folder", "aria-label": "New folder" });
      add.addEventListener("command", () => document.getElementById("cmd_zenOpenFolderCreation").doCommand());
      header.append(label, add);
    }
    // Just above the first folder, or after the pinned tabs when there are none.
    const before = section.querySelector(":scope > zen-folder") || section.querySelector(":scope > .pinned-tabs-container-separator");
    if (before ? header.nextElementSibling !== before : header.parentElement !== section) {
      before ? before.before(header) : section.append(header);
    }
  }

  /* ---------- Foot ---------- */

  function spaceLabel(space) {
    const icon = space.icon || "";
    return icon && !icon.startsWith("chrome:") && !icon.startsWith("resource:") ? icon : (space.name || "?")[0].toUpperCase();
  }

  function renderFoot() {
    const foot = document.getElementById("zen-sidebar-foot-buttons");
    if (!foot || !window.gZenWorkspaces) {
      return;
    }
    let row = document.getElementById("nyx-sidebar-foot");
    if (!row) {
      row = xul("hbox", { id: "nyx-sidebar-foot", align: "center" });
      foot.append(row);
    }
    const current = gZenWorkspaces.activeWorkspace;
    const buttons = gZenWorkspaces.getWorkspaces().map((space, index) => {
      const button = xul("toolbarbutton", {
        class: "nyx-space toolbarbutton-1",
        label: spaceLabel(space),
        tooltiptext: index < 9 ? `${space.name} (Ctrl+${index + 1})` : space.name,
        "aria-label": space.name,
      });
      if (space.icon?.startsWith("chrome:")) {
        button.setAttribute("label", (space.name || "?")[0].toUpperCase());
      }
      if (space.uuid === current) {
        button.setAttribute("checked", "true");
      }
      button.addEventListener("command", () => gZenWorkspaces.changeWorkspaceWithID(space.uuid));
      return button;
    });
    const add = xul("toolbarbutton", { class: "nyx-add toolbarbutton-1", tooltiptext: "New workspace", "aria-label": "New workspace" });
    add.addEventListener("command", () => document.getElementById("cmd_zenOpenWorkspaceCreation").doCommand());
    const shortcuts = xul("toolbarbutton", { class: "nyx-shortcuts", label: "F1 Shortcuts", tooltiptext: "Keyboard shortcuts (F1)" });
    shortcuts.addEventListener("command", openShortcuts);
    row.replaceChildren(...buttons, add, shortcuts);
  }

  function openShortcuts() {
    openPreferences("zenCKS");
  }

  /* ---------- Keeping up with Zen ---------- */

  function refresh() {
    for (const indicator of document.querySelectorAll(".zen-current-workspace-indicator")) {
      fillIndicator(indicator);
    }
    for (const section of document.querySelectorAll(".zen-workspace-pinned-tabs-section")) {
      placeFoldersHeader(section);
      if (!section.nyxWatched) {
        section.nyxWatched = true;
        new MutationObserver(() => placeFoldersHeader(section)).observe(section, { childList: true });
      }
    }
    for (const button of document.querySelectorAll(".zen-workspace-normal-tabs-section #tabs-newtab-button")) {
      if (button.getAttribute("label") !== "New tab") {
        // Localization would put Firefox's wording back.
        button.removeAttribute("data-l10n-id");
        button.setAttribute("label", "New tab");
      }
    }
    renderFoot();
  }

  const startupDone = (subject, topic) => {
    if (subject !== window) {
      return;
    }
    Services.obs.removeObserver(startupDone, topic);
    window.gZenWorkspaces?.promiseInitialized?.then(refresh);
    setTimeout(refresh, 0);
    window.addEventListener("ZenWorkspacesUIUpdate", refresh);
    window.addEventListener("ZenWorkspaceDataChanged", refresh);
    window.addEventListener("AfterWorkspacesSessionRestore", refresh);
    const spaces = document.getElementById("tabbrowser-arrowscrollbox");
    if (spaces) {
      // Spaces being added or removed, and which one is showing.
      new MutationObserver(refresh).observe(spaces, { childList: true });
      new MutationObserver(renderFoot).observe(spaces, { subtree: true, attributes: true, attributeFilter: ["active"] });
    }
  };
  Services.obs.addObserver(startupDone, "browser-delayed-startup-finished");

  window.addEventListener(
    "keydown",
    event => {
      if (event.key === "F1" && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        openShortcuts();
      }
    },
    true
  );
}
