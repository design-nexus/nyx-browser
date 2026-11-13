/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser's own extensions, installed the way Firefox installs its built-in ones, by id and
// version: the Nyx extension from inside the browser, and Nyx Passwords' from wherever Passwords
// is installed, looked up at every start so an update to Passwords reaches the browser.
// XPIProvider.startup asks for them where it installs Firefox's default theme, before any add-on
// starts, so Passwords' resource: alias is there when its extension loads.

import { NetUtil } from "resource://gre/modules/NetUtil.sys.mjs";

const PASSWORDS_XPI = ["nyx-passwords", "browser", "nyx-passwords-firefox.xpi"];
// Where Passwords' extension was last found, so its add-on can be uninstalled once it's gone:
// Firefox resolves an add-on's resource: address to uninstall it.
const PASSWORDS_PREF = "nyx.passwords.extension";

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
    const addons = [
      { id: "nyx-integration@design-nexus.github.io", base: "resource://nyx/extension/" },
      { id: "nyx-passwords@design-nexus.github.io", base: passwordsBase() },
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
};
