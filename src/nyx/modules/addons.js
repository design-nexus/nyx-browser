/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Installs the browser's own extensions the way Firefox installs its built-in ones, by id and
 * version: the Nyx extension from inside the browser, and Nyx Passwords' from wherever Passwords
 * is installed, looked up at every start so an update to Passwords reaches the browser.
 * Signature checks for anything else aren't touched. */
{
  const PASSWORDS_XPI = "nyx-passwords/browser/nyx-passwords-firefox.xpi";

  /** Passwords' extension, in the user's data folder or the system's. */
  function passwordsBase() {
    const env = name => Services.env.get(name);
    const dirs = [
      env("XDG_DATA_HOME") || PathUtils.join(env("HOME"), ".local/share"),
      ...(env("XDG_DATA_DIRS") || "/usr/local/share:/usr/share").split(":"),
    ];
    for (const dir of dirs.filter(Boolean)) {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      try {
        file.initWithPath(PathUtils.join(dir, PASSWORDS_XPI));
      } catch {
        continue;
      }
      if (file.exists()) {
        const resources = Services.io
          .getProtocolHandler("resource")
          .QueryInterface(Ci.nsIResProtocolHandler);
        resources.setSubstitution(
          "nyx-passwords",
          Services.io.newURI(`jar:${Services.io.newFileURI(file).spec}!/`)
        );
        return "resource://nyx-passwords/";
      }
    }
    return null;
  }

  // Once per process.
  if (!Services.nyxBuiltinAddons) {
    Services.nyxBuiltinAddons = true;
    const { AddonManager } = ChromeUtils.importESModule(
      "resource://gre/modules/AddonManager.sys.mjs"
    );
    const addons = [
      { id: "nyx-integration@design-nexus.github.io", base: "resource://nyx/extension/" },
      { id: "nyx-passwords@design-nexus.github.io", base: passwordsBase() },
    ];
    for (const { id, base } of addons) {
      if (!base) {
        continue; // Passwords isn't installed.
      }
      (async () => {
        const manifest = await (await fetch(`${base}manifest.json`)).json();
        const addon = await AddonManager.maybeInstallBuiltinAddon(id, manifest.version, base);
        await addon?.install?.();
      })().catch(error => console.error(`Browser: couldn't install ${id}`, error));
    }
  }
}
