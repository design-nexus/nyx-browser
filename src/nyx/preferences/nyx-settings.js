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
    const theme = document.getElementById("nyxTheme");
    theme.value = saved.theme || "follow";
    theme.addEventListener("command", () => save({ theme: theme.value }));
    for (const [id, key] of [["nyxAccent", "accent"], ["nyxDensity", "density"]]) {
      const list = document.getElementById(id);
      list.value = saved[key] || "";
      list.addEventListener("command", () => save({ [key]: list.value }));
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
    document.getElementById("nyxPasswordsState").textContent = addon?.isActive
      ? `Logins, passkeys and masked email come from Nyx Passwords (its extension ${addon.version}). Pair it once from its toolbar button.`
      : "Install Nyx Passwords to fill logins, passkeys and masked email here. Browser keeps no passwords of its own.";
  },
};
