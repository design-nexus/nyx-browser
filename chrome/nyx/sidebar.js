/* The sidebar's four modes, in the pref nyx.sidebar.mode: expanded, compact, hidden and auto.
 * Each maps to something Zen already does: its expanded and icon-only sidebars, and its compact
 * mode for hidden, which brings the edge reveal with it. Automatic follows this window's width.
 * The sidebar button and Ctrl+B make a manual choice, which holds until Automatic is chosen again.
 * Zen's prefs are shared between windows, so the focused window decides them. */
{
  const PREF = "nyx.sidebar.mode";
  const VERTICAL = "zen.tabs.vertical";
  const EXPANDED = "zen.view.sidebar-expanded";
  const EXPANDED_FROM = 1400;
  const COMPACT_FROM = 900;
  const BUTTON = "nyx-sidebar-button";

  let applying = false;

  const mode = () => Services.prefs.getStringPref(PREF, "auto");

  function effective() {
    const chosen = mode();
    if (chosen !== "auto") {
      return chosen;
    }
    if (window.innerWidth >= EXPANDED_FROM) {
      return "expanded";
    }
    return window.innerWidth >= COMPACT_FROM ? "compact" : "hidden";
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
    document.getElementById(BUTTON)?.toggleAttribute("checked", open);
  }

  function apply() {
    if (!Services.prefs.getBoolPref(VERTICAL, true)) {
      document.documentElement.setAttribute("nyx-sidebar", "row");
      return;
    }
    const want = effective();
    reflectState(want);
    if (Services.focus.activeWindow !== window) {
      return;
    }
    applying = true;
    try {
      const hidden = want === "hidden";
      if (window.gZenCompactModeManager && gZenCompactModeManager.preference !== hidden) {
        gZenCompactModeManager.preference = hidden;
      }
      if (!hidden && Services.prefs.getBoolPref(EXPANDED, true) !== (want === "expanded")) {
        Services.prefs.setBoolPref(EXPANDED, want === "expanded");
      }
      placeButtonRow(hidden);
    } finally {
      applying = false;
    }
  }

  /** Zen's own toggles change this too. They count as a manual choice, or Automatic undoes them. */
  function onExpandedChanged() {
    if (applying || !Services.prefs.getBoolPref(VERTICAL, true) || Services.focus.activeWindow !== window) {
      return;
    }
    const want = Services.prefs.getBoolPref(EXPANDED, true) ? "expanded" : "compact";
    if (effective() !== want && effective() !== "hidden") {
      Services.prefs.setStringPref(PREF, want);
    }
  }

  function toggle() {
    const now = effective();
    if (now === "hidden") {
      const showing = gNavToolbox.hasAttribute("zen-user-show");
      gNavToolbox.toggleAttribute("zen-user-show", !showing);
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
    if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "b" && Services.prefs.getBoolPref(VERTICAL, true)) {
      event.preventDefault();
      event.stopPropagation();
      toggle();
    }
  }

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", applySoon);
  window.addEventListener("activate", applySoon);
  Services.prefs.addObserver(PREF, apply);
  Services.prefs.addObserver(VERTICAL, apply);
  Services.prefs.addObserver(EXPANDED, onExpandedChanged);
  window.addEventListener(
    "unload",
    () => {
      Services.prefs.removeObserver(PREF, apply);
      Services.prefs.removeObserver(VERTICAL, apply);
      Services.prefs.removeObserver(EXPANDED, onExpandedChanged);
    },
    { once: true }
  );

  const startupDone = (subject, topic) => {
    if (subject === window) {
      Services.obs.removeObserver(startupDone, topic);
      window.gZenCompactModeManager ? apply() : setTimeout(apply, 0);
    }
  };
  Services.obs.addObserver(startupDone, "browser-delayed-startup-finished");
}
