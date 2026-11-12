/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The sidebar's four modes, in the pref nyx.sidebar.mode: expanded, compact, hidden and auto.
 * Each window applies the mode itself: expanded and compact through Zen's per-window
 * gZenVerticalTabsManager.nyxSidebarExpanded, and hidden through Zen's compact mode, which brings
 * the edge reveal with it. Automatic follows this window's own width. The sidebar button and
 * Ctrl+B make a manual choice for every window, which holds until Automatic is chosen again.
 * With horizontal tabs there's no tab sidebar; Firefox's sidebar still holds its panels. */
{
  const PREF = "nyx.sidebar.mode";
  const VERTICAL = "zen.tabs.vertical";
  const EXPANDED_FROM = "nyx.sidebar.auto.expanded-from";
  const COMPACT_FROM = "nyx.sidebar.auto.compact-from";
  // Automatic changes mode this far past a threshold, so a window resized across it doesn't flicker.
  const HYSTERESIS = 32;
  const BUTTON = "nyx-sidebar-button";

  const mode = () => Services.prefs.getStringPref(PREF, "auto");
  const vertical = () => Services.prefs.getBoolPref(VERTICAL, true);
  let shown = null;

  /** The mode this window shows now. */
  function effective() {
    const chosen = mode();
    if (chosen !== "auto") {
      return chosen;
    }
    const width = window.innerWidth;
    const expandedFrom = Services.prefs.getIntPref(EXPANDED_FROM, 1400);
    const compactFrom = Services.prefs.getIntPref(COMPACT_FROM, 900);
    const slack = edge => (shown && shown !== "row" ? edge - HYSTERESIS : edge);
    if (width >= (shown === "expanded" ? slack(expandedFrom) : expandedFrom)) {
      return "expanded";
    }
    if (width >= (shown === "hidden" ? compactFrom + HYSTERESIS : slack(compactFrom))) {
      return "compact";
    }
    return "hidden";
  }

  /** In hidden mode the sidebar's top row slides away with it, so its button moves to the top bar. */
  function placeButtonRow(hidden) {
    const row = document.getElementById("zen-sidebar-top-buttons");
    const navBar = document.getElementById("nav-bar");
    if (row && navBar && hidden && row.parentElement !== navBar) {
      navBar.prepend(row);
    }
  }

  function reflectState(want) {
    document.documentElement.setAttribute("nyx-sidebar", want);
    const open = want === "expanded" || (want === "hidden" && gNavToolbox.hasAttribute("zen-user-show"));
    const button = document.getElementById(BUTTON);
    button?.toggleAttribute("checked", open);
    button?.setAttribute("aria-pressed", String(open));
  }

  function apply() {
    if (!vertical()) {
      shown = "row";
      gZenVerticalTabsManager.nyxSidebarExpanded = null;
      document.documentElement.setAttribute("nyx-sidebar", "row");
      return;
    }
    const want = effective();
    reflectState(want);
    if (want === shown) {
      return;
    }
    shown = want;
    const hidden = want === "hidden";
    if (gZenCompactModeManager.preference !== hidden) {
      gZenCompactModeManager.preference = hidden;
    }
    if (!hidden) {
      const expanded = want === "expanded";
      if (gZenVerticalTabsManager.nyxSidebarExpanded !== expanded) {
        gZenVerticalTabsManager.nyxSidebarExpanded = expanded;
        gZenVerticalTabsManager._updateEvent();
      }
    }
    placeButtonRow(hidden);
  }

  /** Expanded, then compact, then hidden: the button and Ctrl+B. In hidden mode they reveal it. */
  function toggle() {
    const now = effective();
    if (now === "hidden") {
      gNavToolbox.toggleAttribute("zen-user-show", !gNavToolbox.hasAttribute("zen-user-show"));
      reflectState("hidden");
    } else {
      Services.prefs.setStringPref(PREF, now === "expanded" ? "compact" : "expanded");
    }
  }

  window.NyxSidebar = { toggle, apply, effective };

  let pending = 0;
  function applySoon() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(apply);
  }

  function onKey(event) {
    if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "b" && vertical()) {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }
  }

  const prefs = [PREF, VERTICAL, EXPANDED_FROM, COMPACT_FROM];
  window.addEventListener("keydown", onKey, true);
  for (const pref of prefs) {
    Services.prefs.addObserver(pref, applySoon);
  }
  window.addEventListener(
    "unload",
    () => {
      for (const pref of prefs) {
        Services.prefs.removeObserver(pref, applySoon);
      }
    },
    { once: true }
  );

  const startupDone = (subject, topic) => {
    if (subject !== window) {
      return;
    }
    Services.obs.removeObserver(startupDone, topic);
    apply();
    new ResizeObserver(() => mode() === "auto" && applySoon()).observe(document.documentElement);
  };
  Services.obs.addObserver(startupDone, "browser-delayed-startup-finished");
}
