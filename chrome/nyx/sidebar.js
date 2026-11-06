/* The sidebar's four modes, in the pref nyx.sidebar.mode: expanded, compact, hidden and auto.
 * Each maps to something Zen already does: its expanded and icon-only sidebars, and its compact
 * mode for hidden, which brings the edge reveal and shortcut with it. Automatic follows this
 * window's width. The prefs are shared between windows, so the focused window decides. */
{
  const PREF = "nyx.sidebar.mode";
  const EXPANDED_FROM = 1400;
  const COMPACT_FROM = 900;

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

  function apply() {
    if (!Services.prefs.getBoolPref("zen.tabs.vertical", true) || Services.focus.activeWindow !== window) {
      return;
    }
    const want = effective();
    document.documentElement.setAttribute("nyx-sidebar", want);
    const hidden = want === "hidden";
    if (window.gZenCompactModeManager && gZenCompactModeManager.preference !== hidden) {
      gZenCompactModeManager.preference = hidden;
    }
    if (!hidden && Services.prefs.getBoolPref("zen.view.sidebar-expanded", true) !== (want === "expanded")) {
      Services.prefs.setBoolPref("zen.view.sidebar-expanded", want === "expanded");
    }
  }

  let pending = 0;
  function applySoon() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(apply);
  }

  window.addEventListener("resize", applySoon);
  window.addEventListener("activate", applySoon);
  Services.prefs.addObserver(PREF, apply);
  Services.prefs.addObserver("zen.tabs.vertical", apply);
  window.addEventListener(
    "unload",
    () => {
      Services.prefs.removeObserver(PREF, apply);
      Services.prefs.removeObserver("zen.tabs.vertical", apply);
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
