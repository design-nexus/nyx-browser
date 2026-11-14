/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser's settings panes. Prefs bind through Firefox's Preferences; theme, accent and density go
 * to appearance.json and the Nyx apps to integrations.json, the files the native host and Nyx
 * Settings read. */

/* import-globals-from /browser/components/preferences/preferences.js */

// Firefox's General pane registers some of the same prefs, and a second registration throws.
const nyxPrefs = [
  { id: "zen.tabs.vertical", type: "bool" },
  { id: "nyx.sidebar.mode", type: "string" },
  { id: "nyx.effects.frosted", type: "bool" },
  { id: "nyx.toolbar.qr-button", type: "bool" },
  { id: "nyx.bookmarks.icons-only", type: "bool" },
  { id: "browser.toolbars.bookmarks.visibility", type: "string" },
  { id: "nyx.tabs.middle-click-close", type: "bool" },
  { id: "browser.tabs.closeWindowWithLastTab", type: "bool", inverted: true },
  { id: "nyx.sidebar.foot-spaces", type: "bool" },
  { id: "zen.view.compact.show-sidebar-and-toolbar-on-hover", type: "bool" },
  { id: "browser.link.open_newwindow.override.external", type: "int" },
  { id: "browser.tabs.warnOnClose", type: "bool" },
  { id: "nyx.tabs.close-buttons", type: "string" },
  { id: "nyx.tabs.overflow", type: "string" },
  { id: "toolkit.tabbox.switchByScrolling", type: "bool" },
  { id: "browser.tabs.hoverPreview.enabled", type: "bool" },
  { id: "zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url", type: "bool" },
  { id: "browser.ctrlTab.sortByRecentlyUsed", type: "bool" },
  { id: "nyx.tabs.unload-after", type: "int" },
  { id: "nyx.tabs.unload-pinned", type: "bool" },
  { id: "browser.sessionstore.restore_on_demand", type: "bool" },
  { id: "browser.startup.page", type: "int" },
  { id: "nyx.selection.mode", type: "string" },
  { id: "nyx.selection.textbox", type: "bool" },
  { id: "nyx.selection.icon-size", type: "string" },
  { id: "nyx.selection.open", type: "string" },
  { id: "nyx.passwords.fill-on-load", type: "bool" },
  { id: "nyx.passwords.field-icons", type: "bool" },
  { id: "nyx.passwords.inline-menu", type: "bool" },
  { id: "nyx.passwords.copy-totp", type: "bool" },
  { id: "nyx.passwords.offer-save", type: "bool" },
  { id: "nyx.passwords.remember-sign-in", type: "bool" },
  { id: "nyx.passwords.passkeys", type: "bool" },
  { id: "nyx.passwords.passkey-auto", type: "bool" },
  { id: "browser.download.useDownloadDir", type: "bool", inverted: true },
  { id: "browser.download.alwaysOpenPanel", type: "bool" },
  { id: "nyx.video.offer", type: "bool" },
  { id: "nyx.video.quality", type: "string" },
  { id: "nyx.video.audio-format", type: "string" },
  { id: "nyx.video.names", type: "string" },
  { id: "nyx.video.embed", type: "bool" },
  { id: "nyx.video.cookies", type: "bool" },
  { id: "nyx.vpn.kill-switch", type: "bool" },
  { id: "nyx.vpn.remote-dns", type: "bool" },
  { id: "nyx.vpn.webrtc", type: "bool" },
  { id: "privacy.query_stripping.enabled", type: "bool" },
];
for (const pref of nyxPrefs) {
  if (!Preferences.get(pref.id)) {
    Preferences.add(pref);
  }
}

const gNyxFiles = {
  config(name) {
    const home = Services.env.get("XDG_CONFIG_HOME") || PathUtils.join(Services.env.get("HOME"), ".config");
    return PathUtils.join(home, "nyx-browser", name);
  },

  async read(name) {
    try {
      return { ok: true, value: await IOUtils.readJSON(this.config(name)) };
    } catch (error) {
      return { ok: error.name === "NotFoundError", value: {} };
    }
  },

  async write(name, value) {
    const file = this.config(name);
    await IOUtils.makeDirectory(PathUtils.parent(file), { ignoreExisting: true });
    await IOUtils.writeJSON(file, value, { tmpPath: `${file}.tmp` });
  },
};

var gNyxAppearancePane = {
  async init() {
    const { value } = await gNyxFiles.read("appearance.json");
    const saved = { theme: "follow", accent: "", density: "", ...value };
    const save = async change => {
      Object.assign(saved, change);
      await gNyxFiles.write("appearance.json", saved);
      const { NyxTheme } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxTheme.sys.mjs");
      NyxTheme.refresh();
    };
    // The theme and density are segmented controls (radiogroups), the accent a list.
    for (const [id, key, fallback] of [["nyxTheme", "theme", "follow"], ["nyxAccent", "accent", ""], ["nyxDensity", "density", ""]]) {
      const control = document.getElementById(id);
      control.value = saved[key] || fallback;
      control.addEventListener("command", () => save({ [key]: control.value }));
    }
  },
};

/**
 * A segmented control or list that stands for several prefs at once: `read` says which choice the
 * prefs make now, and each choice's entry in `choices` is the prefs it sets.
 */
function nyxChoice(id, choices, read) {
  const control = document.getElementById(id);
  const show = () => (control.value = read());
  show();
  control.addEventListener("command", () => {
    for (const [pref, value] of Object.entries(choices[control.value] ?? {})) {
      if (typeof value === "boolean") {
        Services.prefs.setBoolPref(pref, value);
      } else {
        Services.prefs.setStringPref(pref, value);
      }
    }
  });
  for (const pref of new Set(Object.values(choices).flatMap(Object.keys))) {
    Services.prefs.addObserver(pref, show);
    window.addEventListener("unload", () => Services.prefs.removeObserver(pref, show), { once: true });
  }
}

const nyxBool = pref => Services.prefs.getBoolPref(pref, false);

var gNyxTabsPane = {
  init() {
    nyxChoice(
      "nyxNewTabPosition",
      {
        next: { "browser.tabs.insertAfterCurrent": true, "browser.tabs.insertRelatedAfterCurrent": true },
        related: { "browser.tabs.insertAfterCurrent": false, "browser.tabs.insertRelatedAfterCurrent": true },
        end: { "browser.tabs.insertAfterCurrent": false, "browser.tabs.insertRelatedAfterCurrent": false },
      },
      () => {
        if (nyxBool("browser.tabs.insertAfterCurrent")) {
          return "next";
        }
        return nyxBool("browser.tabs.insertRelatedAfterCurrent") ? "related" : "end";
      }
    );
    nyxChoice(
      "nyxBookmarksOpen",
      {
        tab: { "browser.tabs.loadBookmarksInTabs": true, "browser.tabs.loadBookmarksInBackground": false },
        background: { "browser.tabs.loadBookmarksInTabs": true, "browser.tabs.loadBookmarksInBackground": true },
        current: { "browser.tabs.loadBookmarksInTabs": false },
      },
      () => {
        if (!nyxBool("browser.tabs.loadBookmarksInTabs")) {
          return "current";
        }
        return nyxBool("browser.tabs.loadBookmarksInBackground") ? "background" : "tab";
      }
    );
    nyxChoice(
      "nyxUrlbarOpen",
      {
        current: { "browser.urlbar.openintab": false, "browser.search.openintab": false },
        tab: { "browser.urlbar.openintab": true, "browser.search.openintab": true },
      },
      () => (nyxBool("browser.urlbar.openintab") ? "tab" : "current")
    );
    // Closing a tab: Firefox goes back to its opener, Zen to the last used, and Browser can go
    // left; with all three off Firefox goes right.
    nyxChoice(
      "nyxAfterClose",
      {
        recent: { "zen.tabs.select-recently-used-on-close": true, "browser.tabs.selectOwnerOnClose": false, "nyx.tabs.select-left-on-close": false },
        left: { "zen.tabs.select-recently-used-on-close": false, "browser.tabs.selectOwnerOnClose": false, "nyx.tabs.select-left-on-close": true },
        right: { "zen.tabs.select-recently-used-on-close": false, "browser.tabs.selectOwnerOnClose": false, "nyx.tabs.select-left-on-close": false },
        opener: { "zen.tabs.select-recently-used-on-close": false, "browser.tabs.selectOwnerOnClose": true, "nyx.tabs.select-left-on-close": false },
      },
      () => {
        if (nyxBool("nyx.tabs.select-left-on-close")) {
          return "left";
        }
        if (nyxBool("zen.tabs.select-recently-used-on-close")) {
          return "recent";
        }
        return nyxBool("browser.tabs.selectOwnerOnClose") ? "opener" : "right";
      }
    );
    nyxChoice(
      "nyxDoubleClick",
      {
        rename: { "zen.tabs.rename-tabs": true, "browser.tabs.closeTabByDblclick": false, "nyx.tabs.double-click": "" },
        close: { "browser.tabs.closeTabByDblclick": true, "nyx.tabs.double-click": "" },
        pin: { "zen.tabs.rename-tabs": false, "browser.tabs.closeTabByDblclick": false, "nyx.tabs.double-click": "pin" },
        unload: { "zen.tabs.rename-tabs": false, "browser.tabs.closeTabByDblclick": false, "nyx.tabs.double-click": "unload" },
        none: { "zen.tabs.rename-tabs": false, "browser.tabs.closeTabByDblclick": false, "nyx.tabs.double-click": "" },
      },
      () => {
        if (nyxBool("browser.tabs.closeTabByDblclick")) {
          return "close";
        }
        const own = Services.prefs.getStringPref("nyx.tabs.double-click", "");
        if (own) {
          return own;
        }
        return nyxBool("zen.tabs.rename-tabs") ? "rename" : "none";
      }
    );
    gNyxSessions.init();
  },
};

/**
 * A comma-separated pref shown as chips, each with a button to remove it, and an Add button that
 * asks for one more. `note` is shown while the list is empty.
 */
function nyxChips({ pref, box, add, note, ask, normalize = value => value.trim().toLowerCase() }) {
  const container = document.getElementById(box);
  const read = () => Services.prefs.getStringPref(pref, "").split(",").map(s => s.trim()).filter(Boolean);
  const write = values => Services.prefs.setStringPref(pref, [...new Set(values)].join(","));
  const show = () => {
    const values = read();
    container.replaceChildren(
      ...values.map(value => {
        const chip = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
        chip.className = "nyx-chip";
        chip.textContent = value;
        const remove = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
        remove.className = "nyx-chip-remove";
        document.l10n.setAttributes(remove, "nyx-chip-remove", { name: value });
        remove.addEventListener("click", () => write(read().filter(v => v !== value)));
        chip.append(remove);
        return chip;
      })
    );
    if (note) {
      document.getElementById(note).hidden = values.length > 0;
    }
  };
  document.getElementById(add).addEventListener("command", async () => {
    const [title, prompt] = await document.l10n.formatValues(ask);
    const value = { value: "" };
    if (Services.prompt.prompt(window, title, prompt, value, null, {}) && normalize(value.value)) {
      write([...read(), normalize(value.value)]);
    }
  });
  Services.prefs.addObserver(pref, show);
  window.addEventListener("unload", () => Services.prefs.removeObserver(pref, show), { once: true });
  show();
}

const nyxSiteAsk = [{ id: "nyx-chip-add-site-title" }, { id: "nyx-chip-add-site-prompt" }];
const nyxHost = value => {
  const text = value.trim().toLowerCase();
  try {
    return new URL(text.includes("://") ? text : `https://${text}`).hostname;
  } catch {
    return "";
  }
};

const nyxSearchService = () =>
  ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService;

var gNyxSelectionPane = {
  init() {
    nyxChips({ pref: "nyx.selection.off-sites", box: "nyxSelectionOffSites", add: "nyxSelectionOffAdd", note: "nyxSelectionOffNone", ask: nyxSiteAsk, normalize: nyxHost });
    document.getElementById("nyxSelectionManage").addEventListener("command", () => gotoPref("search"));
    this.showEngines();
    Services.obs.addObserver(this, "browser-search-engine-modified");
    window.addEventListener("unload", () => Services.obs.removeObserver(this, "browser-search-engine-modified"), { once: true });
  },

  observe() {
    this.showEngines();
  },

  list(pref) {
    return Services.prefs.getStringPref(pref, "").split(",").filter(Boolean);
  },

  /** Every engine as a row: drag it to reorder, switch it off to leave it out of the popup. */
  async showEngines() {
    const foot = document.getElementById("nyxSelectionEnginesFoot");
    const box = foot.parentNode;
    const hidden = new Set(this.list("nyx.selection.hidden-engines"));
    const order = this.list("nyx.selection.order");
    const rank = id => (order.includes(id) ? order.indexOf(id) : order.length);
    const engines = (await nyxSearchService().getVisibleEngines()).sort((a, b) => rank(a.id) - rank(b.id));
    const rows = await Promise.all(
      engines.map(async engine => {
        const row = document.createXULElement("hbox");
        row.className = "nyx-row nyx-engine-row";
        row.setAttribute("align", "center");
        row.setAttribute("draggable", "true");
        row.dataset.engine = engine.id;
        const grip = document.createXULElement("image");
        grip.className = "nyx-grip";
        const icon = document.createXULElement("image");
        icon.className = "nyx-engine-icon";
        icon.setAttribute("src", (await engine.getIconURL(32)) || "chrome://browser/content/nyx/icons/search.svg");
        const text = document.createXULElement("hbox");
        text.className = "nyx-row-text";
        text.setAttribute("flex", "1");
        text.setAttribute("align", "baseline");
        const name = document.createXULElement("label");
        name.setAttribute("value", engine.name);
        text.append(name);
        if (engine.aliases?.length) {
          const keyword = document.createXULElement("description");
          keyword.className = "nyx-row-note";
          document.l10n.setAttributes(keyword, "nyx-selection-keyword", { keyword: engine.aliases[0] });
          text.append(keyword);
        }
        const toggle = document.createXULElement("checkbox");
        toggle.className = "nyx-switch";
        toggle.checked = !hidden.has(engine.id);
        toggle.setAttribute("aria-label", engine.name);
        toggle.addEventListener("command", () => {
          const now = new Set(this.list("nyx.selection.hidden-engines"));
          toggle.checked ? now.delete(engine.id) : now.add(engine.id);
          Services.prefs.setStringPref("nyx.selection.hidden-engines", [...now].join(","));
        });
        row.append(grip, icon, text, toggle);
        return row;
      })
    );
    box.querySelectorAll(".nyx-engine-row").forEach(row => row.remove());
    foot.before(...rows);
    let dragged = null;
    for (const row of rows) {
      row.addEventListener("dragstart", event => {
        dragged = row;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", row.dataset.engine);
      });
      row.addEventListener("dragover", event => {
        if (dragged && dragged !== row) {
          event.preventDefault();
          const after = event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
          (after ? row.nextSibling : row) !== dragged && box.insertBefore(dragged, after ? row.nextSibling : row);
        }
      });
      row.addEventListener("dragend", () => {
        dragged = null;
        Services.prefs.setStringPref("nyx.selection.order", [...box.querySelectorAll(".nyx-engine-row")].map(r => r.dataset.engine).join(","));
      });
    }
  },
};

var gNyxDownloadsPane = {
  get video() {
    return ChromeUtils.importESModule("chrome://browser/content/nyx/NyxVideo.sys.mjs").NyxVideo;
  },

  init() {
    const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
    const home = path => path.replace(Services.env.get("HOME"), "~");
    const showFiles = async () => {
      document.getElementById("nyxDownloadsFolder").textContent = home(await Downloads.getPreferredDownloadsDirectory());
    };
    const showVideos = async () => {
      document.getElementById("nyxVideoFolder").textContent = home(await this.video.folder());
    };
    const examples = {
      "title-channel": "Ridge loop in 4K [Trail Days].mp4",
      title: "Ridge loop in 4K.mp4",
      "channel-title": "Trail Days - Ridge loop in 4K.mp4",
      "date-title": "2026-11-10 Ridge loop in 4K.mp4",
    };
    const showNames = () => {
      document.getElementById("nyxVideoNamesExample").textContent = examples[Services.prefs.getStringPref("nyx.video.names", "title-channel")] ?? "";
    };
    const choose = async (titleId, start, done) => {
      const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
      fp.init(window.browsingContext, await document.l10n.formatValue(titleId), Ci.nsIFilePicker.modeGetFolder);
      const dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      dir.initWithPath(start);
      fp.displayDirectory = dir;
      fp.open(result => result === Ci.nsIFilePicker.returnOK && done(fp.file.path));
    };
    document.getElementById("nyxDownloadsFolderChange").addEventListener("command", async () => {
      choose("nyx-downloads-folder-title", await Downloads.getPreferredDownloadsDirectory(), path => {
        Services.prefs.setStringPref("browser.download.dir", path);
        Services.prefs.setIntPref("browser.download.folderList", 2);
        showFiles();
      });
    });
    document.getElementById("nyxVideoFolderChange").addEventListener("command", async () => {
      choose("nyx-video-folder-title", await this.video.folder(), path => {
        Services.prefs.setStringPref("nyx.video.folder", path);
        showVideos();
      });
    });
    Services.prefs.addObserver("nyx.video.names", showNames);
    window.addEventListener("unload", () => Services.prefs.removeObserver("nyx.video.names", showNames), { once: true });
    showFiles();
    showVideos();
    showNames();
    this.video.version().then(
      ({ version, path }) => document.l10n.setAttributes(document.getElementById("nyxVideoVersion"), "nyx-video-version", { version, path: path ?? "" }),
      () => document.l10n.setAttributes(document.getElementById("nyxVideoVersion"), "nyx-video-missing")
    );
  },
};
var gNyxPasswordsPane = {
  get passwords() {
    return ChromeUtils.importESModule("chrome://browser/content/nyx/NyxPasswords.sys.mjs").NyxPasswords;
  },

  init() {
    document.getElementById("nyxPasswordsOpen").addEventListener("command", () => {
      window.browsingContext.topChromeWindow?.NyxPasswordsUI?.openPopup();
    });
    document.getElementById("nyxPasswordsLock").addEventListener("command", async () => {
      await this.passwords.lock();
      this.showStatus();
    });
    document.getElementById("nyxPasswordsImport").addEventListener("command", () => this.import());
    this.showStatus();
    this.showFirefox();
  },

  async showStatus() {
    const note = document.getElementById("nyxPasswordsStatus");
    let state = "unavailable";
    if (await this.passwords.paired()) {
      state = (await this.passwords.status()).state ?? "unavailable";
    } else {
      state = "unpaired";
    }
    document.l10n.setAttributes(note, `nyx-passwords-state-${["unlocked", "locked", "unpaired"].includes(state) ? state : "unavailable"}`);
    document.getElementById("nyxPasswordsLock").hidden = state !== "unlocked";
  },

  async showFirefox() {
    const count = (await Services.logins.getAllLogins()).length;
    document.l10n.setAttributes(document.getElementById("nyxPasswordsFirefoxCount"), "nyx-passwords-firefox-count", { count });
    document.getElementById("nyxPasswordsImport").disabled = count === 0;
  },

  async import() {
    const button = document.getElementById("nyxPasswordsImport");
    button.disabled = true;
    const { moved, left } = await this.passwords.importFirefoxLogins();
    document.l10n.setAttributes(document.getElementById("nyxPasswordsFirefoxCount"), "nyx-passwords-imported", { moved, left });
    button.disabled = left === 0;
  },
};
var gNyxBlockingPane = {
  UBO: "uBlock0@raymondhill.net",

  async init() {
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const on = document.getElementById("nyxBlockingOn");
    const show = addon => {
      on.checked = !!addon?.isActive;
      on.disabled = !addon;
      const note = document.getElementById("nyxBlockingVersion");
      if (addon) {
        document.l10n.setAttributes(note, "nyx-blocking-version", { version: addon.version });
      } else {
        document.l10n.setAttributes(note, "nyx-blocking-missing");
      }
    };
    show(await AddonManager.getAddonByID(this.UBO));
    on.addEventListener("command", async () => {
      const addon = await AddonManager.getAddonByID(this.UBO);
      await (on.checked ? addon?.enable() : addon?.disable());
      show(await AddonManager.getAddonByID(this.UBO));
    });
    // uBlock's dashboard keeps its lists, filters and trusted sites.
    const dashboard = page => () => {
      const policy = WebExtensionPolicy.getByID(this.UBO);
      if (policy) {
        window.browsingContext.topChromeWindow?.openTrustedLinkIn(policy.getURL(`dashboard.html#${page}`), "tab");
      }
    };
    document.getElementById("nyxBlockingLists").addEventListener("command", dashboard("3p-filters.html"));
    document.getElementById("nyxBlockingTrusted").addEventListener("command", dashboard("whitelist.html"));
    // Firefox's cookie banner handling: 1 refuses where it can, 0 is off.
    const banners = document.getElementById("nyxCookieBanners");
    banners.checked = Services.prefs.getIntPref("cookiebanners.service.mode", 0) !== 0;
    banners.addEventListener("command", () => {
      const mode = banners.checked ? 1 : 0;
      Services.prefs.setIntPref("cookiebanners.service.mode", mode);
      Services.prefs.setIntPref("cookiebanners.service.mode.privateBrowsing", mode);
    });
  },
};
var gNyxVpnPane = {
  get vpn() {
    return ChromeUtils.importESModule("chrome://browser/content/nyx/NyxVpn.sys.mjs").NyxVpn;
  },

  init() {
    nyxChips({ pref: "nyx.vpn.bypass", box: "nyxVpnBypass", add: "nyxVpnBypassAdd", note: "nyxVpnBypassNone", ask: nyxSiteAsk, normalize: value => (value.trim().startsWith("*.") ? `*.${nyxHost(value.trim().slice(2))}` : nyxHost(value)) });
    const form = document.getElementById("nyxVpnAddGroup");
    document.getElementById("nyxVpnAdd").addEventListener("command", () => {
      form.dataset.open = "true";
      this.showForm();
    });
    document.getElementById("nyxVpnAddCancel").addEventListener("command", () => this.closeForm());
    document.getElementById("nyxVpnAddSave").addEventListener("command", () => this.add());
    document.getElementById("nyxVpnProvider").addEventListener("command", () => this.showForm());
    this.closeForm();
    this.showForm();
    const stop = this.vpn.onChange(() => this.show());
    window.addEventListener("unload", stop, { once: true });
    this.show();
  },

  // The form is its own card, shown only while adding (data-open; Settings shows every card of a
  // pane as it opens it, so hidden alone wouldn't keep it closed).
  closeForm() {
    const form = document.getElementById("nyxVpnAddGroup");
    delete form.dataset.open;
    for (const id of ["nyxVpnHost", "nyxVpnPort", "nyxVpnUser", "nyxVpnPassword"]) {
      document.getElementById(id).value = "";
    }
    document.getElementById("nyxVpnError").textContent = "";
  },

  showForm() {
    const provider = document.getElementById("nyxVpnProvider").value;
    document.getElementById("nyxVpnAddGroup").setAttribute("nyx-provider", provider);
    document.l10n.setAttributes(document.getElementById("nyxVpnHelp"), `nyx-vpn-help-${provider}`);
    document.l10n.setAttributes(document.getElementById("nyxVpnUserLabel"), provider === "proxy" ? "nyx-vpn-username-optional" : "nyx-vpn-service-username");
  },

  async add() {
    const value = id => document.getElementById(id).value.trim();
    const provider = document.getElementById("nyxVpnProvider").value;
    const error = document.getElementById("nyxVpnError");
    error.textContent = "";
    if (provider !== "proxy" && (!value("nyxVpnUser") || !document.getElementById("nyxVpnPassword").value)) {
      document.l10n.setAttributes(error, "nyx-vpn-need-login");
      return;
    }
    const details = { provider, username: value("nyxVpnUser"), password: document.getElementById("nyxVpnPassword").value };
    if (provider === "proxy") {
      Object.assign(details, { type: document.getElementById("nyxVpnType").value, host: value("nyxVpnHost"), port: value("nyxVpnPort"), name: value("nyxVpnHost") });
    }
    document.getElementById("nyxVpnAddSave").disabled = true;
    try {
      await this.vpn.add(details);
      this.closeForm();
    } catch (e) {
      error.textContent = e.message;
    } finally {
      document.getElementById("nyxVpnAddSave").disabled = false;
    }
  },

  async show() {
    const state = await this.vpn.state();
    const box = document.getElementById("nyxVpnConnections");
    const addRow = document.getElementById("nyxVpnAddRow");
    box.querySelectorAll(".nyx-vpn-connection").forEach(row => row.remove());
    for (const c of state.connections) {
      const row = document.createXULElement("hbox");
      row.className = "nyx-row nyx-vpn-connection";
      row.setAttribute("align", "center");
      const text = document.createXULElement("vbox");
      text.className = "nyx-row-text";
      text.setAttribute("flex", "1");
      const name = document.createXULElement("label");
      name.setAttribute("value", c.name);
      const sub = document.createXULElement("description");
      sub.className = "nyx-row-note";
      const kind = { https: "HTTPS proxy", http: "HTTP proxy", socks: "SOCKS5 proxy" }[c.type];
      const where = [c.location?.name, c.location?.city].filter(Boolean).join(", ");
      sub.textContent = [state.active === c.id ? "●" : "", `${c.host}:${c.port}`, kind, where].filter(Boolean).join(" · ");
      text.append(name, sub);
      const toggle = document.createXULElement("button");
      document.l10n.setAttributes(toggle, state.active === c.id ? "nyx-vpn-disconnect" : "nyx-vpn-connect");
      toggle.addEventListener("command", () => this.vpn.setActive(state.active === c.id ? null : c.id));
      const remove = document.createXULElement("button");
      document.l10n.setAttributes(remove, "nyx-vpn-remove");
      remove.addEventListener("command", () => this.vpn.remove(c.id));
      row.append(text, toggle, remove);
      addRow.before(row);
    }
    // Each workspace: the switch's VPN, none, or one of its own.
    const spaces = document.getElementById("nyxVpnWorkspaces");
    spaces.querySelectorAll(".nyx-row").forEach(row => row.remove());
    const workspaces = window.browsingContext.topChromeWindow?.gZenWorkspaces?.getWorkspaces() ?? [];
    for (const workspace of workspaces) {
      const row = document.createXULElement("hbox");
      row.className = "nyx-row";
      row.setAttribute("align", "center");
      const name = document.createXULElement("label");
      name.className = "nyx-row-text";
      name.setAttribute("flex", "1");
      name.setAttribute("value", `${workspace.icon && !workspace.icon.endsWith(".svg") ? `${workspace.icon}  ` : ""}${workspace.name}`);
      const list = document.createXULElement("menulist");
      const popup = document.createXULElement("menupopup");
      const item = (value, l10nId, label) => {
        const node = document.createXULElement("menuitem");
        node.setAttribute("value", value);
        if (l10nId) {
          document.l10n.setAttributes(node, l10nId);
        } else {
          node.setAttribute("label", label);
        }
        popup.append(node);
      };
      item("default", "nyx-vpn-workspace-default");
      item("none", "nyx-vpn-workspace-none");
      for (const c of state.connections) {
        item(c.id, null, `${c.name}${c.location?.name ? ` · ${c.location.name}` : ""}`);
      }
      list.append(popup);
      list.value = state.workspaces[workspace.uuid] ?? "default";
      list.addEventListener("command", () => this.vpn.setWorkspace(workspace.uuid, list.value));
      row.append(name, list);
      spaces.append(row);
    }
  },
};

/** Saved sessions: the open tabs of the window Settings is in, under a name, in the profile. */
var gNyxSessions = {
  get file() {
    return PathUtils.join(PathUtils.profileDir, "nyx-sessions.json");
  },

  async read() {
    try {
      const { sessions } = await IOUtils.readJSON(this.file);
      return Array.isArray(sessions) ? sessions : [];
    } catch {
      return [];
    }
  },

  async write(sessions) {
    await IOUtils.writeJSON(this.file, { sessions }, { tmpPath: `${this.file}.tmp` });
    this.refresh();
  },

  init() {
    document.getElementById("nyxSessionSave").addEventListener("command", () => this.save());
    document.getElementById("nyxSessionMenu").addEventListener("popupshowing", () => this.fill());
    this.refresh();
  },

  async refresh() {
    const sessions = await this.read();
    const note = document.getElementById("nyxSessionsNote");
    if (sessions.length) {
      document.l10n.setAttributes(note, "nyx-tabs-sessions-saved", { count: sessions.length });
    } else {
      document.l10n.setAttributes(note, "nyx-tabs-sessions-description");
    }
  },

  async save() {
    const win = window.browsingContext.topChromeWindow;
    const tabs = win.gBrowser.tabs
      .filter(tab => !tab.closing && !tab.hasAttribute("zen-empty-tab"))
      .map(tab => ({ url: tab.linkedBrowser.currentURI.spec, title: tab.label }))
      .filter(({ url }) => /^(https?|file):/.test(url));
    if (!tabs.length) {
      return;
    }
    const [title, prompt] = await document.l10n.formatValues([
      { id: "nyx-tabs-sessions-name-title" },
      { id: "nyx-tabs-sessions-name-prompt" },
    ]);
    const name = { value: new Date().toLocaleString() };
    if (!Services.prompt.prompt(window, title, prompt, name, null, {}) || !name.value.trim()) {
      return;
    }
    const sessions = await this.read();
    sessions.unshift({ name: name.value.trim(), saved: Date.now(), tabs });
    await this.write(sessions);
  },

  async fill() {
    const menu = document.getElementById("nyxSessionMenu");
    const sessions = await this.read();
    menu.replaceChildren();
    if (!sessions.length) {
      const empty = document.createXULElement("menuitem");
      empty.disabled = true;
      document.l10n.setAttributes(empty, "nyx-tabs-sessions-empty");
      menu.append(empty);
      return;
    }
    sessions.forEach((session, index) => {
      const sub = document.createXULElement("menu");
      sub.setAttribute("label", session.name);
      const popup = document.createXULElement("menupopup");
      const open = document.createXULElement("menuitem");
      document.l10n.setAttributes(open, "nyx-tabs-sessions-open", { count: session.tabs.length });
      open.addEventListener("command", () => {
        const win = window.browsingContext.topChromeWindow;
        for (const { url } of session.tabs) {
          win.openTrustedLinkIn(url, "tab", { inBackground: true });
        }
      });
      const remove = document.createXULElement("menuitem");
      document.l10n.setAttributes(remove, "nyx-tabs-sessions-delete");
      remove.addEventListener("command", async () => {
        const all = await this.read();
        all.splice(index, 1);
        await this.write(all);
      });
      popup.append(open, remove);
      sub.append(popup);
      menu.append(sub);
    });
  },
};

var gNyxToolbarPane = {
  init() {
    document.getElementById("nyxCustomize").addEventListener("command", () => {
      window.browsingContext.topChromeWindow?.gCustomizeMode.enter();
    });
  },
};

var gNyxIntegrationsPane = {
  GROUPS: [
    ["nyxIntegrationShare", "share"],
    ["nyxIntegrationCapture", "capture"],
    ["nyxIntegrationAssistant", "assistant"],
  ],

  async init() {
    const { ok, value } = await gNyxFiles.read("integrations.json");
    document.getElementById("nyxIntegrationsUnreadable").hidden = ok;
    for (const [id, key] of this.GROUPS) {
      const box = document.getElementById(id);
      // As the host reads it: a group not listed is on, a listed one only if it's true, and a
      // file that can't be read turns everything off.
      box.checked = ok && (!(key in value) || value[key] === true);
      box.addEventListener("command", () => this.save());
    }
    this.showPasswords();
  },

  async save() {
    const { value } = await gNyxFiles.read("integrations.json");
    for (const [id, key] of this.GROUPS) {
      value[key] = document.getElementById(id).checked;
    }
    await gNyxFiles.write("integrations.json", value);
    document.getElementById("nyxIntegrationsUnreadable").hidden = true;
  },

  showPasswords() {
    document.l10n.setAttributes(document.getElementById("nyxPasswordsState"), "nyx-integrations-passwords-built-in");
  },
};
