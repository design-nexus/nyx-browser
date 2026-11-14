/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Open in: the installed browsers (`nyx-browser-bridge browsers`), opening a page in one
// (`open-in ID URL [--private]`), the one Alt+Shift+O and the menus' first row use, and sites
// that always open elsewhere. The button's dropdown is a panel view like Share's.

import { NyxBridge } from "chrome://browser/content/nyx/NyxBridge.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
});

const VIEW_ID = "PanelUI-nyx-openin";
const SITES_VIEW_ID = "PanelUI-nyx-openin-sites";
const DEFAULT_PREF = "nyx.openin.default";
const SITES_PREF = "nyx.openin.sites";
const UNAVAILABLE = "Other browsers couldn't be found.";

let listed = null;

function webAddress(uri) {
  const url = uri && lazy.BrowserUtils.getShareableURL(uri);
  return url && (url.schemeIs("http") || url.schemeIs("https")) ? url.spec : null;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export const NyxOpenIn = {
  VIEW_ID,
  webAddress,

  /** The browsers, read once a session and again whenever the dropdown opens. */
  list({ fresh = false } = {}) {
    if (!listed || fresh) {
      listed = NyxBridge.run(["browsers"], UNAVAILABLE).catch(() => []);
    }
    return listed;
  },

  /** The browser Alt+Shift+O and the menus' first row open: the last one used, or Firefox. */
  preferred(list) {
    const chosen = Services.prefs.getStringPref(DEFAULT_PREF, "");
    return list.find(b => b.id === chosen) ?? list.find(b => /firefox/i.test(b.id)) ?? list[0] ?? null;
  },

  async open(browser, url, { privately = false } = {}) {
    if (!url) {
      return;
    }
    Services.prefs.setStringPref(DEFAULT_PREF, browser.id);
    await NyxBridge.run(["open-in", browser.id, url, ...(privately ? ["--private"] : [])], UNAVAILABLE);
  },

  async openPreferred(url) {
    const browser = this.preferred(await this.list());
    if (browser) {
      await this.open(browser, url);
    }
  },

  /** Sites that always open in another browser, by host: {"zoom.us": "chromium"}. */
  sites() {
    try {
      return JSON.parse(Services.prefs.getStringPref(SITES_PREF, "{}")) || {};
    } catch {
      return {};
    }
  },

  setSite(host, id) {
    const sites = this.sites();
    if (id) {
      sites[host] = id;
    } else {
      delete sites[host];
    }
    Services.prefs.setStringPref(SITES_PREF, JSON.stringify(sites));
  },

  /** The browser a host always opens in: its own rule, or its parent domain's. */
  siteRule(host) {
    const sites = this.sites();
    for (let name = host; name; name = name.includes(".") ? name.slice(name.indexOf(".") + 1) : "") {
      if (sites[name]) {
        return sites[name];
      }
    }
    return null;
  },

  icon(browser) {
    return browser.icon ? `file://${browser.icon}` : "chrome://browser/content/nyx/icons/browser.svg";
  },

  /** Makes the dropdown's views in a window, where CustomizableUI looks for them. */
  createView(document) {
    if (document.getElementById(VIEW_ID)) {
      return;
    }
    const make = (id, l10nId) => {
      const view = document.createXULElement("panelview");
      view.id = id;
      view.className = "PanelUI-subView nyx-openin-view";
      const [{ attributes }] = new Localization(["browser/nyx-browser.ftl"], true).formatMessagesSync([{ id: l10nId }]);
      view.setAttribute("title", attributes.find(a => a.name === "title").value);
      const body = document.createXULElement("vbox");
      body.className = "panel-subview-body";
      view.append(body);
      const cache = document.getElementById("appMenu-viewCache");
      (cache?.content ?? cache ?? document.getElementById("mainPopupSet")).appendChild(view);
      return view;
    };
    make(VIEW_ID, "nyx-openin-view");
    make(SITES_VIEW_ID, "nyx-openin-sites-view");
  },

  async show(view) {
    const document = view.ownerDocument;
    const window = document.defaultView;
    const body = view.querySelector(".panel-subview-body");
    const url = webAddress(window.gBrowser.currentURI);
    const host = hostOf(url);
    const close = () => window.CustomizableUI.hidePanelForNode(view);
    const row = (l10nId, args, image) => {
      const button = document.createXULElement("toolbarbutton");
      button.className = "subviewbutton subviewbutton-iconic";
      if (image) {
        button.setAttribute("image", image);
      }
      document.l10n.setAttributes(button, l10nId, args);
      return button;
    };

    const fill = list => {
      body.replaceChildren();
      const header = document.createXULElement("label");
      header.className = "subview-subheader";
      document.l10n.setAttributes(header, "nyx-openin-heading");
      body.append(header);
      if (!list.length) {
        const note = document.createXULElement("description");
        note.className = "nyx-share-note";
        document.l10n.setAttributes(note, "nyx-openin-none");
        body.append(note);
        return;
      }
      const preferred = this.preferred(list);
      for (const browser of list) {
        const line = document.createXULElement("hbox");
        line.className = "nyx-openin-row";
        const open = row("nyx-openin-browser", { name: browser.name }, this.icon(browser));
        open.setAttribute("flex", "1");
        open.classList.add("nyx-openin-browser");
        open.dataset.browser = browser.id;
        open.disabled = !url;
        if (browser === preferred) {
          open.setAttribute("shortcut", "Alt+Shift+O");
        }
        open.addEventListener("command", () => this.open(browser, url).finally(close));
        line.append(open);
        if (browser.private) {
          const privately = row("nyx-openin-private", { name: browser.name }, "chrome://browser/content/nyx/icons/private.svg");
          privately.classList.add("nyx-openin-private");
          privately.disabled = !url;
          privately.addEventListener("command", () => this.open(browser, url, { privately: true }).finally(close));
          line.append(privately);
        }
        body.append(line);
      }
      if (host) {
        body.append(document.createXULElement("toolbarseparator"));
        const ruled = list.find(b => b.id === this.siteRule(host));
        const always = row(ruled ? "nyx-openin-site-ruled" : "nyx-openin-site", { host, name: ruled?.name ?? "" });
        always.classList.add("subviewbutton-nav");
        always.setAttribute("closemenu", "none");
        always.addEventListener("command", () => {
          this.showSites(document.getElementById(SITES_VIEW_ID), list, host);
          view.panelMultiView.showSubView(SITES_VIEW_ID, always);
        });
        body.append(always);
      }
    };

    const known = !!listed;
    fill(await this.list());
    if (known) {
      fill(await this.list({ fresh: true }));
    }
  },

  /** Where a site always opens: one of the browsers, or here. */
  showSites(view, list, host) {
    const document = view.ownerDocument;
    const body = view.querySelector(".panel-subview-body");
    body.replaceChildren();
    const current = this.siteRule(host);
    const choice = (l10nId, args, image, id) => {
      const button = document.createXULElement("toolbarbutton");
      button.className = "subviewbutton subviewbutton-iconic";
      button.setAttribute("type", "checkbox");
      button.toggleAttribute("checked", (current ?? "") === id);
      if (image) {
        button.setAttribute("image", image);
      }
      document.l10n.setAttributes(button, l10nId, args);
      button.addEventListener("command", () => {
        this.setSite(host, id);
        document.defaultView.CustomizableUI.hidePanelForNode(view);
      });
      return button;
    };
    body.append(choice("nyx-openin-site-here", { host }, "chrome://browser/content/nyx/icons/browser.svg", ""));
    for (const browser of list) {
      body.append(choice("nyx-openin-site-in", { name: browser.name }, this.icon(browser), browser.id));
    }
  },
};
