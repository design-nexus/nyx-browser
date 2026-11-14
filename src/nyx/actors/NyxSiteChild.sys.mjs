/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Site styles and scripts in a web page (NyxSiteKit keeps them). Styles go in as one author
// sheet as soon as the document exists, and are swapped when a style or the theme changes.
// Scripts run in a sandbox of their own, with the GM functions they ask for; one with
// `@grant none` sees the page's own objects. A .user.js or .user.css file opened as a page is
// offered to the window for installing.

import { sectionMatches, scriptMatches } from "resource://nyx/actors/NyxSiteCode.sys.mjs";

const KEY = "nyx:sitekit";
const valuesKey = id => `nyx:sitekit:values:${id}`;
const MAX_INSTALL = 5 * 1024 * 1024;

// The GM.* promise forms, built in the script's sandbox from its GM_* functions.
const PRELUDE = `
var GM = {
  info: GM_info,
  getValue: (k, d) => Promise.resolve(GM_getValue(k, d)),
  setValue: (k, v) => Promise.resolve(GM_setValue(k, v)),
  deleteValue: k => Promise.resolve(GM_deleteValue(k)),
  listValues: () => Promise.resolve(GM_listValues()),
  getValues: keys => Promise.resolve(Object.fromEntries(keys.map(k => [k, GM_getValue(k)]))),
  addStyle: css => Promise.resolve(GM_addStyle(css)),
  openInTab: (u, o) => Promise.resolve(GM_openInTab(u, o)),
  setClipboard: (d, t) => Promise.resolve(GM_setClipboard(d, t)),
  notification: (d, t, i, c) => Promise.resolve(GM_notification(d, t, i, c)),
  registerMenuCommand: (c, f, o) => Promise.resolve(GM_registerMenuCommand(c, f, o)),
  unregisterMenuCommand: id => Promise.resolve(GM_unregisterMenuCommand(id)),
  getResourceText: n => Promise.resolve(GM_getResourceText(n)),
  getResourceUrl: n => Promise.resolve(GM_getResourceURL(n)),
  addValueChangeListener: (k, f) => Promise.resolve(GM_addValueChangeListener(k, f)),
  removeValueChangeListener: id => Promise.resolve(GM_removeValueChangeListener(id)),
  xmlHttpRequest: d => new Promise((resolve, reject) => {
    const onload = d.onload, onerror = d.onerror;
    GM_xmlhttpRequest(Object.assign({}, d, {
      onload: r => { onload && onload(r); resolve(r); },
      onerror: e => { onerror && onerror(e); reject(e); },
    }));
  }),
};
GM.xmlhttpRequest = GM.xmlHttpRequest;
GM.getResourceURL = GM.getResourceUrl;
`;

export class NyxSiteChild extends JSWindowActorChild {
  #sheet = "";
  #sheetText = "";
  #scripts = null;
  #ran = new Set();
  #menus = new Map();
  #menuId = 0;
  #listening = false;
  #valueListeners = new Map();
  #listenerId = 0;
  #values = new Map();

  get #url() {
    return this.document?.documentURI ?? "";
  }

  get #web() {
    return /^https?:/.test(this.#url);
  }

  handleEvent(event) {
    if (!this.#web) {
      return;
    }
    switch (event.type) {
      case "DOMWindowCreated":
        this.#listen();
        this.#applyStyles();
        this.#run("start");
        break;
      case "DOMContentLoaded":
        if (event.target !== this.document) {
          return;
        }
        this.#run("end");
        this.contentWindow?.setTimeout(() => this.#run("idle"), 0);
        this.#offerInstall();
        break;
      case "pageshow":
      case "popstate":
      case "hashchange":
        this.#applyStyles();
        break;
    }
  }

  // ---- Styles ----

  #listen() {
    if (this.#listening) {
      return;
    }
    this.#listening = true;
    Services.cpmm.sharedData.addEventListener("change", this.#changed);
  }

  #changed = event => {
    if (!this.document || !this.#web) {
      return;
    }
    if (event.changedKeys.includes(KEY)) {
      this.#applyStyles();
    }
    for (const key of event.changedKeys) {
      if (key.startsWith("nyx:sitekit:values:")) {
        this.#valuesChanged(key.slice("nyx:sitekit:values:".length));
      }
    }
  };

  didDestroy() {
    if (this.#listening) {
      Services.cpmm.sharedData.removeEventListener("change", this.#changed);
    }
  }

  /** Every style section for this address, as one author sheet; the theme's tokens with them. */
  #applyStyles() {
    const window = this.contentWindow;
    if (!window) {
      return;
    }
    const url = this.#url;
    const data = Services.cpmm.sharedData.get(KEY);
    const parts = [];
    let tokens = false;
    for (const style of data?.styles ?? []) {
      for (const section of style.sections) {
        if (section.code && sectionMatches(section, url)) {
          parts.push(section.code);
          tokens ||= style.tokens;
        }
      }
    }
    const text = parts.length ? `${tokens ? data.tokens : ""}${parts.join("\n")}` : "";
    if (text === this.#sheetText) {
      return;
    }
    const utils = window.windowUtils;
    if (this.#sheet) {
      try {
        utils.removeSheetUsingURIString(this.#sheet, utils.AUTHOR_SHEET);
      } catch {}
    }
    this.#sheetText = text;
    this.#sheet = text ? `data:text/css;charset=utf-8,${encodeURIComponent(text)}` : "";
    if (this.#sheet) {
      utils.loadSheetUsingURIString(this.#sheet, utils.AUTHOR_SHEET);
    }
  }

  // ---- Scripts ----

  #matching() {
    if (!this.#scripts) {
      const top = this.browsingContext === this.browsingContext.top;
      const url = this.#url;
      this.#scripts = (Services.cpmm.sharedData.get(KEY)?.scripts ?? []).filter(s => (top || !s.meta.noframes) && scriptMatches(s.meta, url));
    }
    return this.#scripts;
  }

  #run(when) {
    for (const script of this.#matching()) {
      if (script.meta.runAt === when && !this.#ran.has(script.id)) {
        this.#ran.add(script.id);
        this.#execute(script);
      }
    }
    if (when === "idle" && this.#ran.size) {
      this.#report();
    }
  }

  /** Tells the window which scripts run here and their menu commands, for the Site card. */
  #report() {
    const scripts = this.#matching().filter(s => this.#ran.has(s.id)).map(s => ({ id: s.id, name: s.name }));
    const menus = [...this.#menus].map(([id, m]) => ({ id, script: m.script, caption: m.caption }));
    this.sendAsyncMessage("NyxSite:Running", { scripts, menus });
  }

  receiveMessage({ name, data }) {
    if (name === "NyxSite:RunMenu") {
      const menu = this.#menus.get(data.id);
      try {
        menu?.callback();
      } catch (error) {
        console.error(error);
      }
    }
    return null;
  }

  #execute(script) {
    const window = this.contentWindow;
    if (!window) {
      return;
    }
    const grants = new Set(script.meta.grant);
    const pageWorld = !grants.size || (grants.size === 1 && grants.has("none"));
    const sandbox = Cu.Sandbox(window, {
      sandboxPrototype: window,
      sameZoneAs: window,
      wantXrays: !pageWorld,
      sandboxName: `Nyx script: ${script.name}`,
    });
    this.#defineApi(sandbox, script, pageWorld);
    const file = name => `nyx-script://${script.id}/${encodeURIComponent(name)}`;
    try {
      Cu.evalInSandbox(PRELUDE, sandbox, "latest", file("prelude.js"), 1);
      script.requires.forEach((code, i) => Cu.evalInSandbox(code, sandbox, "latest", file(`require-${i}.js`), 1));
      Cu.evalInSandbox(script.code, sandbox, "latest", file(`${script.name}.user.js`), 1);
    } catch (error) {
      window.console.error(`Browser: the script "${script.name}" stopped:`, String(error?.message ?? error));
    }
  }

  #valuesOf(id) {
    if (!this.#values.has(id)) {
      this.#values.set(id, { ...(Services.cpmm.sharedData.get(valuesKey(id)) ?? {}) });
    }
    return this.#values.get(id);
  }

  /** Another tab changed a script's values: listeners hear what changed, as remote changes. */
  #valuesChanged(id) {
    if (!this.#values.has(id)) {
      return;
    }
    const old = this.#values.get(id);
    const fresh = { ...(Services.cpmm.sharedData.get(valuesKey(id)) ?? {}) };
    this.#values.set(id, fresh);
    for (const listener of this.#valueListeners.values()) {
      if (listener.script !== id) {
        continue;
      }
      const before = JSON.stringify(old[listener.key]);
      const after = JSON.stringify(fresh[listener.key]);
      if (before !== after) {
        listener.call(old[listener.key], fresh[listener.key], true);
      }
    }
  }

  #defineApi(sandbox, script, pageWorld) {
    const window = this.contentWindow;
    const id = script.id;
    const clone = value => (value === undefined || value === null || typeof value !== "object" ? value : Cu.cloneInto(value, sandbox, { cloneFunctions: false }));
    const plain = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
    const define = (name, fn) => Cu.exportFunction(fn, sandbox, { defineAs: name });
    const grants = new Set(script.meta.grant);
    const granted = (...names) => pageWorld || names.some(n => grants.has(n));

    const info = {
      script: {
        name: script.meta.name,
        namespace: script.meta.namespace,
        version: script.meta.version,
        description: script.meta.description,
        matches: script.meta.match,
        includes: script.meta.include,
        excludes: script.meta.exclude,
        runAt: `document-${script.meta.runAt}`,
        resources: Object.entries(script.resources).map(([name, r]) => ({ name, url: r.url })),
        uuid: script.uuid,
      },
      scriptHandler: "Nyx Browser",
      version: Services.appinfo.version,
      scriptMetaStr: (/==UserScript==[\s\S]*?==\/UserScript==/.exec(script.code) ?? [""])[0],
      uuid: script.uuid,
    };
    sandbox.GM_info = Cu.cloneInto(info, sandbox);
    sandbox.unsafeWindow = pageWorld ? window : window.wrappedJSObject;
    define("GM_log", (...args) => window.console.log(...args));

    define("GM_getValue", (key, fallback) => {
      const values = this.#valuesOf(id);
      return key in values ? clone(values[key]) : fallback;
    });
    define("GM_setValue", (key, value) => {
      const stored = plain(value);
      const values = this.#valuesOf(id);
      const old = values[key];
      values[key] = stored;
      this.sendAsyncMessage("NyxSite:SetValue", { id, key: String(key), value: stored });
      this.#notifyLocal(id, key, old, stored);
    });
    define("GM_deleteValue", key => {
      const values = this.#valuesOf(id);
      const old = values[key];
      delete values[key];
      this.sendAsyncMessage("NyxSite:SetValue", { id, key: String(key) });
      this.#notifyLocal(id, key, old, undefined);
    });
    define("GM_listValues", () => Cu.cloneInto(Object.keys(this.#valuesOf(id)), sandbox));
    define("GM_addValueChangeListener", (key, callback) => {
      const listenerId = ++this.#listenerId;
      this.#valueListeners.set(listenerId, {
        script: id,
        key,
        call: (old, value, remote) => {
          try {
            callback(key, clone(old), clone(value), remote);
          } catch (error) {
            window.console.error(error);
          }
        },
      });
      return listenerId;
    });
    define("GM_removeValueChangeListener", listenerId => this.#valueListeners.delete(listenerId));

    define("GM_addStyle", css => {
      const utils = window.windowUtils;
      utils.loadSheetUsingURIString(`data:text/css;charset=utf-8,${encodeURIComponent(String(css))}`, utils.AUTHOR_SHEET);
      return this.document.createElement("style");
    });
    define("GM_getResourceText", name => script.resources[name]?.text ?? null);
    define("GM_getResourceURL", name => script.resources[name]?.dataUrl ?? null);

    define("GM_registerMenuCommand", (caption, callback) => {
      const menuId = ++this.#menuId;
      this.#menus.set(menuId, { script: id, caption: String(caption), callback });
      if (this.#ran.size) {
        this.#report();
      }
      return menuId;
    });
    define("GM_unregisterMenuCommand", menuId => {
      this.#menus.delete(menuId);
      this.#report();
    });

    if (granted("GM_openInTab", "GM.openInTab")) {
      define("GM_openInTab", (url, options) => {
        const background = options === true || options?.active === false || (options && typeof options === "object" && options.loadInBackground === true);
        this.sendAsyncMessage("NyxSite:OpenInTab", { id, url: String(url), background });
        return Cu.cloneInto({ closed: false }, sandbox);
      });
    }
    if (granted("GM_setClipboard", "GM.setClipboard")) {
      define("GM_setClipboard", data => this.sendAsyncMessage("NyxSite:Clipboard", { id, text: String(data) }));
    }
    if (granted("GM_notification", "GM.notification")) {
      define("GM_notification", (details, title, image, onclick) => {
        const d = typeof details === "object" && details ? details : { text: details, title, image, onclick };
        this.sendQuery("NyxSite:Notify", { id, title: String(d.title ?? script.meta.name), text: String(d.text ?? "") }).then(clicked => {
          if (clicked && typeof d.onclick === "function") {
            d.onclick();
          }
        });
      });
    }
    if (granted("GM_xmlhttpRequest", "GM.xmlHttpRequest", "GM.xmlhttpRequest")) {
      define("GM_xmlhttpRequest", details => {
        const request = {
          method: details.method,
          url: String(details.url ?? ""),
          headers: plain(details.headers),
          data: typeof details.data === "string" ? details.data : details.data === undefined ? undefined : String(details.data),
          responseType: details.responseType,
          timeout: details.timeout,
          anonymous: !!details.anonymous,
        };
        const call = (name, value) => {
          const fn = details[name];
          if (typeof fn === "function") {
            try {
              fn(Cu.cloneInto(value, sandbox));
            } catch (error) {
              window.console.error(error);
            }
          }
        };
        this.sendQuery("NyxSite:Request", { id, details: request }).then(
          result => {
            const response = { ...result, readyState: 4, responseURL: result.finalUrl };
            if (result.bytes) {
              const buffer = new sandbox.ArrayBuffer(result.bytes.length);
              new sandbox.Uint8Array(buffer).set(result.bytes);
              delete response.bytes;
              const out = Cu.cloneInto(response, sandbox);
              out.response = request.responseType === "blob" ? new sandbox.Blob([buffer], { type: result.contentType }) : buffer;
              for (const name of ["onload", "onloadend"]) {
                try {
                  details[name]?.(out);
                } catch (error) {
                  window.console.error(error);
                }
              }
              return;
            }
            response.response = response.responseText;
            if (request.responseType === "json") {
              try {
                response.response = JSON.parse(response.responseText);
              } catch {
                response.response = null;
              }
            }
            call("onload", response);
            call("onloadend", response);
          },
          error => {
            const failure = { status: 0, statusText: "", readyState: 4, error: String(error?.message ?? error), finalUrl: request.url };
            call(/abort/i.test(failure.error) ? "ontimeout" : "onerror", failure);
            call("onloadend", failure);
          }
        );
        return Cu.cloneInto({ abort() {} }, sandbox, { cloneFunctions: true });
      });
    }
  }

  #notifyLocal(id, key, old, value) {
    for (const listener of this.#valueListeners.values()) {
      if (listener.script === id && listener.key === key) {
        listener.call(old, value, false);
      }
    }
  }

  // ---- Installing ----

  /** A .user.js or .user.css file shown as text in a tab: the window offers to install it. */
  #offerInstall() {
    if (this.browsingContext !== this.browsingContext.top) {
      return;
    }
    let path;
    try {
      path = new URL(this.#url).pathname;
    } catch {
      return;
    }
    const kind = /\.user\.js$/i.test(path) ? "script" : /\.user\.(css|less|styl)$/i.test(path) ? "style" : "";
    const type = this.document.contentType;
    if (!kind || !/^(text\/|application\/(x-)?javascript)/.test(type)) {
      return;
    }
    const text = this.document.body?.textContent ?? "";
    if (!text || text.length > MAX_INSTALL || !/==User(Script|Style)==/.test(text)) {
      return;
    }
    this.sendAsyncMessage("NyxSite:Install", { kind, url: this.#url, text });
  }
}
