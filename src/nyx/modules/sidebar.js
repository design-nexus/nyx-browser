/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The sidebar's four modes, in the pref nyx.sidebar.mode: expanded, compact, hidden and auto.
 * Each window applies the mode itself: expanded and compact through Zen's per-window
 * gZenVerticalTabsManager.nyxSidebarExpanded, and hidden through Zen's compact mode, which brings
 * the edge reveal with it. Automatic follows this window's own width. The sidebar button and
 * Ctrl+B make a manual choice for every window, which holds until Automatic is chosen again,
 * and so do Zen's own compact-mode controls: turning compact mode on chooses hidden, and turning
 * it off goes back to the mode before. With horizontal tabs there's no tab sidebar; Firefox's
 * sidebar still holds its panels, and compact mode is Zen's own. */
{
  const PREF = "nyx.sidebar.mode";
  const VERTICAL = "zen.tabs.vertical";
  const EXPANDED_FROM = "nyx.sidebar.auto.expanded-from";
  const COMPACT_FROM = "nyx.sidebar.auto.compact-from";
  // The mode to go back to when compact mode is turned off with Zen's controls.
  const BEFORE_HIDDEN = "nyx.sidebar.mode.before-hidden";
  // Automatic changes mode this far past a threshold, so a window resized across it doesn't flicker.
  const HYSTERESIS = 32;
  const BUTTON = "nyx-sidebar-button";

  const mode = () => Services.prefs.getStringPref(PREF, "auto");
  const vertical = () => Services.prefs.getBoolPref(VERTICAL, true);
  let shown = null;

  /** The mode this window shows now. */
  function effective() {
    const chosen = mode();
    return chosen === "auto" ? automatic() : chosen;
  }

  /** Automatic's mode for this window's width. */
  function automatic() {
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

  function reflectState(want) {
    document.documentElement.setAttribute("nyx-sidebar", want);
    const open = want === "expanded" || (want === "hidden" && gNavToolbox.hasAttribute("zen-user-show"));
    const button = document.getElementById(BUTTON);
    button?.toggleAttribute("checked", open);
    button?.setAttribute("aria-pressed", String(open));
  }

  // The compact mode this window last asked Zen for, until Zen says it's there. Zen ignores a
  // change while it animates one, and the window asks again once it has.
  let expected = null;

  /**
   * Shows this window's mode. `compact` is how compact mode follows: "change" animates it,
   * "start" sets the window's first state, and "leave" doesn't touch it yet.
   */
  function apply({ compact = "change" } = {}) {
    // Compact mode is for the sidebar: with tabs in rows it isn't offered (its menu entry is
    // hidden in nyx.css) and its command and key do nothing.
    document.getElementById("cmd_zenCompactModeToggle")?.toggleAttribute("disabled", !vertical());
    if (!vertical()) {
      shown = "row";
      gZenVerticalTabsManager.nyxSidebarExpanded = null;
      document.documentElement.setAttribute("nyx-sidebar", "row");
      if (compact === "start") {
        gZenCompactModeManager.startIn(false);
      } else if (compact === "change" && gZenCompactModeManager.preference) {
        expected = false;
        gZenCompactModeManager.preference = false;
      }
      return;
    }
    // In hidden mode Zen's compact mode moves the sidebar's button row into the top bar.
    const want = effective();
    shown = want;
    reflectState(want);
    const hidden = want === "hidden";
    if (compact === "start") {
      gZenCompactModeManager.startIn(hidden);
    } else if (compact === "change" && gZenCompactModeManager.preference !== hidden) {
      expected = hidden;
      gZenCompactModeManager.preference = hidden;
    }
    if (!hidden) {
      const expanded = want === "expanded";
      if (gZenVerticalTabsManager.nyxSidebarExpanded !== expanded) {
        gZenVerticalTabsManager.nyxSidebarExpanded = expanded;
        gZenVerticalTabsManager._updateEvent();
      }
    }
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

  /** Compact mode turned on or off, by this window or by Zen's own controls. */
  function onCompactToggled({ detail: compact }) {
    if (expected !== null) {
      if (compact !== expected) {
        applySoon();
      }
      expected = null;
      return;
    }
    if (!vertical()) {
      // Turned on some other way (a pref, another window): tabs in rows have no compact mode.
      if (compact) {
        expected = false;
        gZenCompactModeManager.preference = false;
      }
      return;
    }
    if (compact === (effective() === "hidden")) {
      return;
    }
    if (compact) {
      Services.prefs.setStringPref(BEFORE_HIDDEN, mode());
      Services.prefs.setStringPref(PREF, "hidden");
      return;
    }
    let back = Services.prefs.getStringPref(BEFORE_HIDDEN, "");
    Services.prefs.clearUserPref(BEFORE_HIDDEN);
    if (!back || back === "hidden" || (back === "auto" && automatic() === "hidden")) {
      back = "expanded";
    }
    Services.prefs.setStringPref(PREF, back);
  }

  window.NyxSidebar = { toggle, apply, effective };

  let pending = 0;
  // Whether Zen's compact mode is set up in this window.
  let ready = false;
  function applySoon() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => apply({ compact: ready ? "change" : "leave" }));
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
    // Zen sets up compact mode once the session is restored.
    apply({ compact: "leave" });
    gZenStartup.promiseInitialized.then(() => {
      ready = true;
      apply({ compact: "start" });
      new ResizeObserver(() => mode() === "auto" && applySoon()).observe(document.documentElement);
      window.addEventListener("ZenCompactMode:Toggled", onCompactToggled);
    });
  };
  Services.obs.addObserver(startupDone, "browser-delayed-startup-finished");
}
