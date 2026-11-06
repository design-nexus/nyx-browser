/* Follows the theme file the launcher keeps current. Polled once a second, like the suite's
 * other apps; a changed file swaps the stylesheet in place. */
{
  const FILE = PathUtils.join(Services.env.get("XDG_STATE_HOME") || PathUtils.join(Services.env.get("HOME"), ".local/state"), "nyx-browser", "tokens.css");
  const utils = window.windowUtils;
  let loaded = null;
  let loadedTime = 0;

  function applyScheme() {
    const scheme = getComputedStyle(document.documentElement).getPropertyValue("--nyx-scheme").trim();
    const value = { dark: 0, light: 1 }[scheme];
    if (value !== undefined && Services.prefs.getIntPref("zen.view.window.scheme", 2) !== value) {
      Services.prefs.setIntPref("zen.view.window.scheme", value);
    }
  }

  async function refresh() {
    let info;
    try {
      info = await IOUtils.stat(FILE);
    } catch {
      return; // The launcher hasn't written it; the built-in values stay.
    }
    if (info.lastModified === loadedTime) {
      return;
    }
    loadedTime = info.lastModified;
    const url = `resource://nyx-state/tokens.css?${loadedTime}`;
    utils.loadSheetUsingURIString(url, utils.AUTHOR_SHEET);
    if (loaded) {
      utils.removeSheetUsingURIString(loaded, utils.AUTHOR_SHEET);
    }
    loaded = url;
    applyScheme();
  }

  refresh();
  const timer = setInterval(refresh, 1000);
  window.addEventListener("unload", () => clearInterval(timer), { once: true });
}
