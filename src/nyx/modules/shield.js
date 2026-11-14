/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Content blocking's shield in the address field: uBlock Origin, built in, does the blocking;
 * the shield says how much it blocked on the page and holds its controls for the site (blocking
 * on or off, the element picker and zapper, pop-ups, large media, cosmetic filtering, web fonts,
 * JavaScript), with uBlock's own dashboard for the rest. uBlock tells the page's state in its
 * button's title, per tab (Browser's patch, nyx/ublock/), and takes Browser's commands. */
{
  const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const UBO = "uBlock0@raymondhill.net";
  const HTML = "http://www.w3.org/1999/xhtml";

  const extension = () => WebExtensionPolicy.getByID(UBO)?.extension ?? null;

  /** What uBlock says of a tab's page, or null when it isn't running or has nothing to say. */
  function stateOf(tab) {
    const ext = extension();
    if (!ext || !tab) {
      return null;
    }
    try {
      const title = ExtensionParent.apiManager.global.browserActionFor?.(ext)?.action?.getContextData(tab)?.title ?? "";
      return title.startsWith("NYX") ? JSON.parse(title.slice(3)) : null;
    } catch {
      return null;
    }
  }

  const command = name => extension()?.shortcuts?.onCommand(name);

  // ---- the shield ----

  const button = document.createXULElement("hbox");
  button.id = "nyx-shield-button";
  button.className = "urlbar-page-action";
  button.setAttribute("role", "button");
  button.setAttribute("tabindex", "0");
  button.hidden = true;
  const count = document.createXULElement("label");
  count.className = "nyx-shield-count";
  button.append(document.createXULElement("image"), count);
  button.firstChild.className = "urlbar-icon";
  (document.getElementById("nyx-qr-button") ?? document.getElementById("star-button-box"))?.before(button);

  let shown = "";
  function update() {
    const state = /^https?:/.test(gBrowser.currentURI.spec) ? stateOf(gBrowser.selectedTab) : null;
    const key = state ? `${state.on}|${state.blocked}` : "";
    if (key === shown) {
      return;
    }
    shown = key;
    button.hidden = !state;
    if (state) {
      count.value = state.on && state.blocked ? String(state.blocked > 999 ? "999+" : state.blocked) : "";
      button.toggleAttribute("nyx-off", !state.on);
      document.l10n.setAttributes(button, state.on ? "nyx-shield-button" : "nyx-shield-button-off", { count: state.blocked, host: state.host });
    }
    if (panel?.state === "open") {
      fill();
    }
  }
  // uBlock updates its counts as the page loads; the shield follows the tab in front.
  const timer = setInterval(update, 700);
  gBrowser.tabContainer.addEventListener("TabSelect", update);

  button.addEventListener("click", event => event.button === 0 && openPanel());
  button.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPanel();
    }
  });

  // ---- its panel ----

  let panel = null;
  let body = null;
  const html = (tag, className, text) => {
    const node = document.createElementNS(HTML, tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  };
  const l10n = (node, id, args) => {
    document.l10n.setAttributes(node, id, args);
    return node;
  };

  function openPanel() {
    if (!panel) {
      panel = document.createXULElement("panel");
      panel.id = "nyx-shield-panel";
      panel.setAttribute("type", "arrow");
      panel.setAttribute("role", "dialog");
      body = html("div", "nyx-shield");
      panel.append(body);
      document.getElementById("mainPopupSet").append(panel);
    }
    fill();
    panel.openPopup(button, "bottomcenter topright", 0, 0);
    button.setAttribute("open", "true");
    panel.addEventListener("popuphidden", () => button.removeAttribute("open"), { once: true });
  }

  function fill() {
    const state = stateOf(gBrowser.selectedTab);
    if (!state) {
      body.replaceChildren(l10n(html("p", "nyx-shield-note"), "nyx-shield-unavailable"));
      return;
    }
    const act = (name, close = false) => () => {
      command(name);
      if (close) {
        panel.hidePopup();
      }
    };

    const head = html("div", "nyx-shield-head");
    const badge = html("span", "nyx-shield-badge");
    badge.toggleAttribute("nyx-off", !state.on);
    const text = html("div", "nyx-shield-text");
    text.append(html("b", null, state.host), l10n(html("small"), state.on ? "nyx-shield-on" : "nyx-shield-off"));
    const toggle = html("button", "nyx-shield-switch");
    toggle.setAttribute("role", "switch");
    toggle.toggleAttribute("nyx-on", state.on);
    l10n(toggle, "nyx-shield-toggle", { host: state.host });
    toggle.addEventListener("click", act("nyx-toggle-site"));
    head.append(badge, text, toggle);

    const big = html("div", "nyx-shield-big");
    const text2 = html("span");
    text2.append(l10n(html("span"), "nyx-shield-blocked"), l10n(html("small"), "nyx-shield-allowed", { count: state.allowed }));
    big.append(html("b", null, state.on ? String(state.blocked) : "0"), text2);

    const tools = html("div", "nyx-shield-tools");
    const tool = (id, name) => {
      const b = html("button", "nyx-shield-tool");
      b.append(img(id === "nyx-shield-pick" ? "picker" : "zap"), l10n(html("span"), id));
      b.addEventListener("click", act(name, true));
      b.disabled = !state.on;
      return b;
    };
    tools.append(tool("nyx-shield-pick", "launch-element-picker"), tool("nyx-shield-zap", "launch-element-zapper"));

    const switches = html("div", "nyx-shield-switches");
    for (const [key, name, icon, id] of [
      ["popups", "nyx-toggle-popups", "popup", "nyx-shield-popups"],
      ["largeMedia", "nyx-toggle-large-media", "image", "nyx-shield-media"],
      ["cosmetic", "nyx-toggle-cosmetic", "eye", "nyx-shield-cosmetic"],
      ["fonts", "nyx-toggle-fonts", "font", "nyx-shield-fonts"],
      ["scripts", "nyx-toggle-scripts", "code", "nyx-shield-scripts"],
    ]) {
      const b = html("button", "nyx-shield-tile");
      b.toggleAttribute("nyx-on", !!state[key]);
      b.append(img(icon), l10n(html("small"), id));
      l10n(b, `${id}-tip`);
      b.addEventListener("click", act(name));
      switches.append(b);
    }

    const foot = html("div", "nyx-shield-foot");
    const settings = l10n(html("button"), "nyx-shield-settings");
    settings.addEventListener("click", () => {
      panel.hidePopup();
      openPreferences("paneNyxBlocking");
    });
    const advanced = l10n(html("button", "nyx-shield-advanced"), "nyx-shield-dashboard");
    advanced.addEventListener("click", act("open-dashboard", true));
    foot.append(settings, advanced);

    body.replaceChildren(head, big, tools, l10n(html("div", "nyx-shield-label"), "nyx-shield-site"), switches, foot);
  }

  function img(name) {
    const node = html("img", "nyx-shield-icon");
    node.src = `chrome://browser/content/nyx/icons/${name}.svg`;
    node.alt = "";
    return node;
  }

  // ---- private windows ----

  // uBlock blocks in private windows too; Firefox asks each extension's permission once.
  if (!Services.prefs.getBoolPref("nyx.blocking.private-allowed", false)) {
    Services.prefs.setBoolPref("nyx.blocking.private-allowed", true);
    AddonManager.getAddonByID(UBO).then(async addon => {
      if (!addon) {
        Services.prefs.clearUserPref("nyx.blocking.private-allowed");
        return;
      }
      const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
      await ExtensionPermissions.add(UBO, { permissions: ["internal:privateBrowsingAllowed"], origins: [] });
      await addon.reload();
    });
  }

  window.addEventListener("unload", () => clearInterval(timer), { once: true });
}
