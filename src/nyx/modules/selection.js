/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Selection search, as Swift Selection Search has it: select text on a page and a popup offers
 * it to your search engines, the selection in a text box on top to change it first, the engines'
 * icons below. A click searches where Settings says (a new tab by default), a middle click in a
 * background tab, Enter with the first engine. The popup is the window's own, drawn above the
 * page; the page only says what's selected and where (NyxSelectionChild). */
{
  const { NyxActors } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxActors.sys.mjs");
  NyxActors.register();
  const { SearchService } = ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs");

  const HTML = "http://www.w3.org/1999/xhtml";
  const PREFS = {
    textbox: "nyx.selection.textbox",
    size: "nyx.selection.icon-size",
    open: "nyx.selection.open",
    hidden: "nyx.selection.hidden-engines",
    order: "nyx.selection.order",
    off: "nyx.selection.off-sites",
  };
  const list = pref => Services.prefs.getStringPref(pref, "").split(",").map(s => s.trim()).filter(Boolean);

  let panel = null;
  let input = null;
  let field = null;
  let hint = null;
  let icons = null;
  let engines = null;

  /** The engines the popup shows, in Settings' order, each with its icon. */
  async function popupEngines() {
    if (!engines) {
      engines = (async () => {
        const hidden = new Set(list(PREFS.hidden));
        const order = list(PREFS.order);
        const rank = engine => {
          const at = order.indexOf(engine.id);
          return at === -1 ? order.length : at;
        };
        const visible = (await SearchService.getVisibleEngines()).filter(e => !hidden.has(e.id));
        visible.sort((a, b) => rank(a) - rank(b));
        return Promise.all(visible.map(async engine => ({ engine, icon: await engine.getIconURL(32) })));
      })();
    }
    return engines;
  }
  const forget = () => (engines = null);
  Services.obs.addObserver(forget, "browser-search-engine-modified");
  Services.prefs.addObserver(PREFS.hidden, forget);
  Services.prefs.addObserver(PREFS.order, forget);

  function html(tag, className) {
    const node = document.createElementNS(HTML, tag);
    node.className = className;
    return node;
  }

  function build() {
    panel = document.createXULElement("panel");
    panel.id = "nyx-selection-panel";
    panel.setAttribute("noautofocus", "true");
    panel.setAttribute("consumeoutsideclicks", "false");
    panel.setAttribute("norolluponanchor", "true");
    panel.setAttribute("role", "dialog");
    const box = html("div", "nyx-sel");
    input = html("input", "nyx-sel-query");
    input.type = "text";
    input.spellcheck = false;
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        popupEngines().then(([first]) => first && search(first.engine, event.shiftKey));
      } else if (event.key === "Escape") {
        panel.hidePopup();
      }
    });
    field = html("div", "nyx-sel-field");
    hint = html("span", "nyx-sel-hint");
    field.append(input, hint);
    icons = html("div", "nyx-sel-icons");
    box.append(field, icons);
    panel.append(box);
    document.getElementById("mainPopupSet").append(panel);
  }

  function button(className, image, tooltip, onClick) {
    const node = html("button", `nyx-sel-icon ${className}`);
    const img = document.createElementNS(HTML, "img");
    img.src = image;
    img.alt = "";
    node.append(img);
    if (tooltip) {
      document.l10n.setAttributes(node, tooltip.id, tooltip.args);
    }
    node.addEventListener("click", event => event.button === 0 && onClick(event));
    node.addEventListener("auxclick", event => event.button === 1 && onClick(event));
    return node;
  }

  function where(background) {
    const open = Services.prefs.getStringPref(PREFS.open, "tab");
    if (background || open === "background") {
      return { where: "tab", inBackground: true };
    }
    return { where: open === "current" ? "current" : "tab", inBackground: false };
  }

  function search(engine, background) {
    const text = input.value.trim();
    if (!text) {
      return;
    }
    const { uri, postData } = engine.getSubmission(text);
    const { where: target, inBackground } = where(background);
    openTrustedLinkIn(uri.spec, target, { postData, inBackground, relatedToCurrent: true });
    panel.hidePopup();
  }

  function openAsLink(background) {
    const text = input.value.trim();
    try {
      const { preferredURI } = Services.uriFixup.getFixupURIInfo(text, Ci.nsIURIFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS);
      if (preferredURI && /^(https?|ftp)$/.test(preferredURI.scheme)) {
        const { where: target, inBackground } = where(background);
        openTrustedLinkIn(preferredURI.spec, target, { inBackground, relatedToCurrent: true });
      }
    } catch {}
    panel.hidePopup();
  }

  function show(browser, data) {
    if (browser !== gBrowser.selectedBrowser || list(PREFS.off).includes(data.host)) {
      return;
    }
    if (!panel) {
      build();
    }
    panel.setAttribute("nyx-size", Services.prefs.getStringPref(PREFS.size, "medium"));
    field.hidden = !Services.prefs.getBoolPref(PREFS.textbox, true);
    input.value = data.text;
    const copy = button("nyx-sel-copy", "chrome://browser/content/nyx/icons/copy.svg", { id: "nyx-selection-copy" }, () => {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(input.value);
      panel.hidePopup();
    });
    const link = button("nyx-sel-link", "chrome://browser/content/nyx/icons/link.svg", { id: "nyx-selection-link" }, event =>
      openAsLink(event.button === 1)
    );
    const line = html("span", "nyx-sel-line");
    icons.replaceChildren(copy, link, line);
    // The engines follow as soon as the search service has them; the popup doesn't wait.
    popupEngines()
      .then(choices => {
        if (choices[0]) {
          document.l10n.setAttributes(hint, "nyx-selection-enter", { name: choices[0].engine.name });
        }
        icons.append(
          ...choices.map(({ engine, icon }) =>
            button("nyx-sel-engine", icon || "chrome://browser/content/nyx/icons/search.svg", { id: "nyx-selection-engine", args: { name: engine.name } }, event =>
              search(engine, event.button === 1)
            )
          )
        );
      })
      .catch(error => console.error("Browser: selection search couldn't read the engines", error));
    // Under the selection, or above it when there's no room below.
    const scale = window.devicePixelRatio;
    const screenBottom = screen.availTop + screen.availHeight;
    const height = field.hidden ? 52 : 92;
    let y = data.bottom / scale + 8;
    if (y + height > screenBottom) {
      y = data.top / scale - height - 8;
    }
    if (panel.state === "open" || panel.state === "showing") {
      panel.moveTo(data.left / scale - 6, y);
    } else {
      panel.openPopupAtScreen(data.left / scale - 6, y, false);
    }
  }

  function hide(browser) {
    if (panel && (!browser || browser === gBrowser.selectedBrowser) && !panel.contains(document.activeElement)) {
      panel.hidePopup();
    }
  }

  gBrowser.tabContainer.addEventListener("TabSelect", () => panel?.hidePopup());
  window.NyxSelectionSearch = { show, hide };
  window.addEventListener(
    "unload",
    () => {
      Services.obs.removeObserver(forget, "browser-search-engine-modified");
      Services.prefs.removeObserver(PREFS.hidden, forget);
      Services.prefs.removeObserver(PREFS.order, forget);
    },
    { once: true }
  );
}
