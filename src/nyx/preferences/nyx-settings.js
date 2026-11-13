/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser's settings panes. Prefs bind through Firefox's Preferences; theme, accent and density go
 * to appearance.json and the Nyx apps to integrations.json, the files the native host and Nyx
 * Settings read. */

/* import-globals-from /browser/components/preferences/preferences.js */

Preferences.addAll([
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
]);

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

var gNyxTabsPane = {
  init() {},
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

  async showPasswords() {
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const addon = await AddonManager.getAddonByID("nyx-passwords@design-nexus.github.io");
    const state = document.getElementById("nyxPasswordsState");
    if (addon?.isActive) {
      document.l10n.setAttributes(state, "nyx-integrations-passwords-active", { version: addon.version });
    } else {
      document.l10n.setAttributes(state, "nyx-integrations-passwords-missing");
    }
  },
};
