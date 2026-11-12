/* Applies the suite's theme to this extension's pages: asked of the native host, and remembered
 * so a page paints in the right colors before the host answers. */
"use strict";

const TOKEN = /^\s*--nyx-([a-z0-9-]+):\s*([^;{}]+);\s*$/;

function applyTokens(css) {
  for (const line of (css || "").split("\n")) {
    const match = TOKEN.exec(line);
    if (match) {
      document.documentElement.style.setProperty(`--nyx-${match[1]}`, match[2].trim());
    }
  }
}

async function followTheme() {
  try {
    const { tokens } = await browser.storage.local.get("tokens");
    applyTokens(tokens);
  } catch {
    // Storage off: the first answer below paints it.
  }
  let last = null;
  const refresh = async () => {
    try {
      const { tokens } = await browser.runtime.sendMessage({ to: "background", action: "theme" });
      if (tokens && tokens !== last) {
        last = tokens;
        applyTokens(tokens);
        browser.storage.local.set({ tokens }).catch(() => {});
      }
    } catch {
      // No host, as in another browser: the page's built-in colors stay.
    }
  };
  refresh();
  setInterval(refresh, 1000);
}

followTheme();
