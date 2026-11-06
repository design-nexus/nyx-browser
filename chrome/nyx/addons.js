/* Installs the browser's own extensions the way Firefox installs its built-in ones: from folders
 * in this install, by id and version. Signature checks for anything else aren't touched. */
{
  const ADDONS = [
    { id: "nyx-integration@design-nexus.github.io", base: "resource://nyx/extension/" },
    { id: "nyx-passwords@design-nexus.github.io", base: "resource://nyx/passwords/" },
  ];

  // Once per process.
  if (!Services.nyxBuiltinAddons) {
    Services.nyxBuiltinAddons = true;
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    for (const { id, base } of ADDONS) {
      (async () => {
        let manifest;
        try {
          manifest = await (await fetch(`${base}manifest.json`)).json();
        } catch {
          return; // Not bundled: Passwords may not be installed.
        }
        const addon = await AddonManager.maybeInstallBuiltinAddon(id, manifest.version, base);
        await addon?.install?.();
      })().catch(error => console.error(`nyx: couldn't install ${id}`, error));
    }
  }
}
