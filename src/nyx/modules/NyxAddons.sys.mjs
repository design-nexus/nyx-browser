/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser's own extensions, installed the way Firefox installs its built-in ones, by id and
// version: the Nyx extension from inside the browser. Nyx Passwords is built in (NyxPasswords),
// and its pages load from its extension's files wherever Passwords is installed, through
// resource://nyx-passwords/, looked up at every start so an update to Passwords reaches the
// browser. XPIProvider.startup asks for these where it installs Firefox's default theme.

import { NetUtil } from "resource://gre/modules/NetUtil.sys.mjs";

const PASSWORDS_XPI = ["nyx-passwords", "browser", "nyx-passwords-firefox.xpi"];
// Where Passwords' extension was last found, so its add-on can be uninstalled once it's gone:
// Firefox resolves an add-on's resource: address to uninstall it.
const PASSWORDS_PREF = "nyx.passwords.extension";

// Built-in extensions that a copy in the profile would hide (an add-on installed in the profile
// wins over a built-in one with its id). The copy goes and its data stays for Browser's.
const ADOPTED = ["uBlock0@raymondhill.net"];
const KEEP_PREFS = [
  "extensions.webextensions.keepStorageOnUninstall",
  "extensions.webextensions.keepUuidOnUninstall",
];

// Extensions doing what Browser now does itself, turned off once (not removed): the user can turn
// them back on. Swift Selection Search (selection search), NordVPN Proxy (VPN), Open With
// (Open in), Offline QR Code (Share), Open Tabs Next to Current (Tabs settings) and Downie
// (video downloads).
const DUPLICATES = [
  "jid1-KdTtiCj6wxVAFA@jetpack",
  "nordvpnproxy@nordvpn.com",
  "openwith@darktrojan.net",
  "offline-qr-code@rugk.github.io",
  "opentabsnexttocurrent@sblask",
  "downie@charliemonroe.net",
];
const DUPLICATES_PREF = "nyx.addons.duplicates-disabled";

/** Points resource://nyx-passwords/ at the extension at `path`. */
function alias(path) {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler)
    .setSubstitution(
      "nyx-passwords",
      Services.io.newURI(`jar:${Services.io.newFileURI(file).spec}!/`)
    );
}

/** Passwords' extension, in the user's data folder or the system's, or null. */
function passwordsBase() {
  const env = name => Services.env.get(name);
  const dirs = [
    env("XDG_DATA_HOME") || PathUtils.join(env("HOME"), ".local", "share"),
    ...(env("XDG_DATA_DIRS") || "/usr/local/share:/usr/share").split(":"),
  ];
  for (const dir of dirs.filter(Boolean)) {
    let path;
    try {
      path = PathUtils.join(dir, ...PASSWORDS_XPI);
    } catch {
      continue;
    }
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    if (file.exists()) {
      alias(path);
      Services.prefs.setStringPref(PASSWORDS_PREF, path);
      return "resource://nyx-passwords/";
    }
  }
  const last = Services.prefs.getStringPref(PASSWORDS_PREF, "");
  if (last) {
    alias(last);
  }
  return null;
}

/** The version in an extension's manifest. Read synchronously: add-ons start right after. */
function manifestVersion(base) {
  const channel = NetUtil.newChannel({
    uri: `${base}manifest.json`,
    loadUsingSystemPrincipal: true,
  });
  const stream = channel.open();
  try {
    return JSON.parse(
      NetUtil.readInputStreamToString(stream, stream.available(), {
        charset: "UTF-8",
      })
    ).version;
  } finally {
    stream.close();
  }
}

export const NyxAddons = {
  /**
   * Browser's built-in extensions. `base` is null for Passwords' when Passwords isn't
   * installed, and its add-on goes with it.
   *
   * @returns {Array<{id: string, base: ?string, version: ?string}>}
   */
  builtins() {
    // Passwords is built into Browser now (NyxPasswords): its pages still load from its
    // extension's files, through the resource: alias, but the extension itself isn't installed,
    // and one installed before goes.
    passwordsBase();
    const addons = [
      { id: "nyx-integration@design-nexus.github.io", base: "resource://nyx/extension/" },
      { id: "nyx-passwords@design-nexus.github.io", base: null },
      // uBlock Origin, under Browser's shield (nyx/tools/vendor-ublock.sh puts it in the build).
      { id: "uBlock0@raymondhill.net", base: "resource://nyx/ublock/" },
    ];
    return addons.flatMap(addon => {
      if (!addon.base) {
        return [{ ...addon, version: null }];
      }
      try {
        return [{ ...addon, version: manifestVersion(addon.base) }];
      } catch (error) {
        // Left as it is: a manifest that can't be read isn't a reason to uninstall.
        console.error(`Browser: couldn't read ${addon.id}'s manifest`, error);
        return [];
      }
    });
  },

  /**
   * Once the add-ons database is ready: a profile's own copy of a built-in extension gives way
   * to Browser's, keeping its settings, and extensions Browser replaces are turned off once.
   */
  async settle() {
    const { AddonManager } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs"
    );
    for (const id of ADOPTED) {
      try {
        const addon = await AddonManager.getAddonByID(id);
        if (addon && !addon.isBuiltin) {
          await this.adopt(addon);
        }
      } catch (error) {
        console.error(`Browser: couldn't replace ${id} with the built-in one`, error);
      }
    }
    if (!Services.prefs.getBoolPref(DUPLICATES_PREF, false)) {
      Services.prefs.setBoolPref(DUPLICATES_PREF, true);
      for (const addon of await AddonManager.getAddonsByIDs(DUPLICATES)) {
        if (addon?.isActive) {
          await addon.disable().catch(console.error);
        }
      }
    }
  },

  /** Uninstalls `addon`, a profile's copy of a built-in extension, keeping its data and UUID. */
  async adopt(addon) {
    const kept = KEEP_PREFS.filter(pref => !Services.prefs.prefHasUserValue(pref));
    for (const pref of kept) {
      Services.prefs.setBoolPref(pref, true);
    }
    try {
      await addon.uninstall();
    } finally {
      for (const pref of kept) {
        Services.prefs.clearUserPref(pref);
      }
    }
  },
};
