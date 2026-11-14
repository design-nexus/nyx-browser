/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The window's side of NyxSiteChild: a script's values, requests, tabs, clipboard and
// notifications, each checked against the script (on, for this page, granted) before it's done;
// the scripts running in a tab and their menu commands, for the Site card; and .user.js and
// .user.css files to offer for installing.

import { scriptMatches } from "resource://nyx/actors/NyxSiteCode.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NyxSiteKit: "chrome://browser/content/nyx/NyxSiteKit.sys.mjs",
});

// The window hears this with the tab's browser and {kind, url, text}.
export const INSTALL_TOPIC = "nyx-sitekit-install";
// …and this when a tab's scripts or their menu commands change.
export const RUNNING_TOPIC = "nyx-sitekit-running";

export class NyxSiteParent extends JSWindowActorParent {
  scripts = [];
  menus = [];

  get #pageUrl() {
    return this.manager.documentURI?.spec ?? "";
  }

  /** The script, if it's on, runs on this page and asked for one of `grants` (none: any). */
  #script(id, ...grants) {
    const script = lazy.NyxSiteKit.script(id);
    if (!script || !scriptMatches(script.meta, this.#pageUrl)) {
      return null;
    }
    if (grants.length && !script.meta.grant.some(g => grants.includes(g))) {
      return null;
    }
    return script;
  }

  async receiveMessage({ name, data }) {
    switch (name) {
      case "NyxSite:SetValue":
        if (this.#script(data.id)) {
          lazy.NyxSiteKit.setValue(data.id, data.key, data.value);
        }
        return null;
      case "NyxSite:Request":
        if (!this.#script(data.id, "GM_xmlhttpRequest", "GM.xmlHttpRequest", "GM.xmlhttpRequest")) {
          throw new Error("Not allowed.");
        }
        return lazy.NyxSiteKit.request(data.id, this.#pageUrl, data.details);
      case "NyxSite:AbortRequest":
        lazy.NyxSiteKit.abortRequest(data.requestId);
        return null;
      case "NyxSite:OpenInTab": {
        if (!this.#script(data.id, "GM_openInTab", "GM.openInTab")) {
          return null;
        }
        let url;
        try {
          url = new URL(data.url, this.#pageUrl);
        } catch {
          return null;
        }
        if (!/^https?:$/.test(url.protocol)) {
          return null;
        }
        const window = this.browsingContext.topChromeWindow;
        window?.openLinkIn(url.href, data.background ? "tabshifted" : "tab", {
          triggeringPrincipal: this.manager.documentPrincipal,
          relatedToCurrent: true,
        });
        return null;
      }
      case "NyxSite:Clipboard":
        if (this.#script(data.id, "GM_setClipboard", "GM.setClipboard")) {
          Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(data.text);
        }
        return null;
      case "NyxSite:Notify": {
        if (!this.#script(data.id, "GM_notification", "GM.notification")) {
          return false;
        }
        return new Promise(resolve => {
          const alerts = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
          const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(Ci.nsIAlertNotification);
          alert.init(`nyx-script-${data.id}`, "", data.title.slice(0, 200), data.text.slice(0, 1000), true);
          alerts.showAlert(alert, (subject, topic) => {
            if (topic === "alertclickcallback") {
              resolve(true);
            } else if (topic === "alertfinished") {
              resolve(false);
            }
          });
        });
      }
      case "NyxSite:Running": {
        const known = new Set(data.scripts.map(s => s.id));
        this.scripts = data.scripts.filter(s => this.#script(s.id));
        this.menus = data.menus.filter(m => known.has(m.script));
        Services.obs.notifyObservers(this.browsingContext.top.embedderElement, RUNNING_TOPIC);
        return null;
      }
      case "NyxSite:Install": {
        const browser = this.browsingContext.top.embedderElement;
        if (browser && this.browsingContext === this.browsingContext.top) {
          Services.obs.notifyObservers(browser, INSTALL_TOPIC, JSON.stringify({ kind: data.kind, url: this.#pageUrl, text: data.text }));
        }
        return null;
      }
    }
    return null;
  }

  /** Runs a menu command a script added on this page. */
  runMenu(id) {
    this.sendAsyncMessage("NyxSite:RunMenu", { id });
  }
}

/**
 * The scripts running in a tab, in any of its frames, and their menu commands:
 * [{id, name, menus: [{caption, run()}]}].
 */
export function scriptsInTab(browser) {
  const found = new Map();
  for (const context of browser?.browsingContext?.getAllBrowsingContextsInSubtree() ?? []) {
    const actor = context.currentWindowGlobal?.getExistingActor("NyxSite");
    if (!actor) {
      continue;
    }
    for (const script of actor.scripts) {
      if (!found.has(script.id)) {
        found.set(script.id, { id: script.id, name: script.name, menus: [] });
      }
    }
    for (const menu of actor.menus) {
      found.get(menu.script)?.menus.push({ caption: menu.caption, run: () => actor.runMenu(menu.id) });
    }
  }
  return [...found.values()];
}
