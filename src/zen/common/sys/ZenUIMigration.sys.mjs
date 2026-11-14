/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
  NyxWidgets: "chrome://browser/content/nyx/NyxWidgets.sys.mjs",
  ZenCustomizableUI: "resource:///modules/ZenCustomizableUI.sys.mjs",
});

class nsZenUIMigration {
  PREF_NAME = "zen.ui.migration.version";
  MIGRATION_VERSION = 8;

  init(isNewProfile) {
    if (!isNewProfile) {
      try {
        this._migrate();
      } catch (e) {
        console.error("ZenUIMigration: Error during migration", e);
      }
    }
    this.#migrateLibraryButton();
    this.#migrateNyxToolbars();
    this.clearVariables();
    if (this.shouldRestart) {
      Services.startup.quit(
        Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart
      );
    }
  }

  get _migrationVersion() {
    return Services.prefs.getIntPref(this.PREF_NAME, 0);
  }

  set _migrationVersion(value) {
    Services.prefs.setIntPref(this.PREF_NAME, value);
  }

  _migrate() {
    for (let i = 0; i <= this.MIGRATION_VERSION; i++) {
      if (this._migrationVersion < i) {
        this[`_migrateV${i}`]?.();
      }
    }
  }

  clearVariables() {
    this._migrationVersion = this.MIGRATION_VERSION;
  }

  /**
   * Nyx: profiles from before Browser's own top bar get its buttons where the mockups have them,
   * once. Extensions' buttons stay where they are. Profiles already arranged only gain buttons
   * that aren't anywhere yet (Passwords', from version 3; VPN's and Open in's, from version 5)
   * and lose the ones Browser no longer has (the shortcuts hint in the sidebar's foot, from
   * version 4).
   */
  #migrateNyxToolbars() {
    const pref = "nyx.ui.migration.toolbars";
    const version = Services.prefs.getIntPref(pref, 0);
    if (version >= 5) {
      return;
    }
    const RETIRED = ["nyx-shortcuts-button"];
    // From version 5: Passwords' extension button gives its place to the built-in one, and uBlock
    // Origin's goes to the extensions panel (its shield is in the address field).
    const REPLACED = new Map([
      ["nyx-passwords_design-nexus_github_io-browser-action", "nyx-passwords-button"],
      ["ublock0_raymondhill_net-browser-action", null],
    ]);
    const CUI = lazy.CustomizableUI;
    const areas = new Map([
      [CUI.AREA_NAVBAR, lazy.NyxWidgets.navbarPlacements],
      ["zen-sidebar-top-buttons", [lazy.NyxWidgets.SIDEBAR_BUTTON]],
      ["zen-sidebar-foot-buttons", lazy.ZenCustomizableUI.defaultSidebarIcons],
    ]);
    // A toolbar's saved placements are only there once a window has it.
    const listener = {
      onAreaNodeRegistered: area => {
        const placements = areas.get(area);
        if (!placements) {
          return;
        }
        areas.delete(area);
        for (const id of RETIRED) {
          if (CUI.getPlacementOfWidget(id, false)?.area === area) {
            CUI.removeWidgetFromArea(id);
          }
        }
        for (const [old, id] of REPLACED) {
          const placement = CUI.getPlacementOfWidget(old, false, true);
          if (placement?.area === area) {
            if (!id) {
              CUI.addWidgetToArea(old, CUI.AREA_ADDONS);
              continue;
            }
            CUI.removeWidgetFromArea(old);
            if (!CUI.getPlacementOfWidget(id, false)) {
              CUI.addWidgetToArea(id, area, placement.position);
            }
          }
        }
        if (version < 2) {
          for (const id of CUI.getWidgetIdsInArea(area)) {
            if (
              !CUI.isWebExtensionWidget(id) &&
              (CUI.isSpecialWidget(id) || !placements.includes(id))
            ) {
              CUI.removeWidgetFromArea(id);
            }
          }
        }
        placements.forEach((id, index) => {
          if (version < 2 || !CUI.getPlacementOfWidget(id, false)) {
            CUI.addWidgetToArea(id, area, index);
          }
        });
        if (!areas.size) {
          CUI.removeListener(listener);
          Services.prefs.setIntPref(pref, 5);
          Services.prefs.clearUserPref("nyx.toolbar.arranged");
        }
      },
    };
    CUI.addListener(listener);
  }

  #migrateLibraryButton() {
    const donePref = "zen.library.migrated-downloads-button";
    if (
      !Services.prefs.getBoolPref("zen.library.enabled", false) ||
      Services.prefs.getBoolPref(donePref, false)
    ) {
      return;
    }
    // A toolbar's saved placements are only there once a window has it.
    const footButtons = "zen-sidebar-foot-buttons";
    const listener = {
      onAreaNodeRegistered: area => {
        if (area !== footButtons) {
          return;
        }
        lazy.CustomizableUI.removeListener(listener);
        Services.prefs.setBoolPref(donePref, true);
        if (lazy.CustomizableUI.getPlacementOfWidget("zen-library-button")) {
          return;
        }
        const downloads =
          lazy.CustomizableUI.getPlacementOfWidget("downloads-button");
        const standsIn = downloads?.area === footButtons;
        lazy.CustomizableUI.addWidgetToArea(
          "zen-library-button",
          footButtons,
          standsIn ? downloads.position : 0
        );
        if (standsIn) {
          lazy.CustomizableUI.removeWidgetFromArea("downloads-button");
        }
      },
    };
    lazy.CustomizableUI.addListener(listener);
  }

  _migrateV1() {
    // If there's an userChrome.css or userContent.css existing, we set
    // 'toolkit.legacyUserProfileCustomizations.stylesheets' back to true
    // We do this to avoid existing user stylesheets to be ignored
    const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
    const userChromeFile = profileDir.clone();
    userChromeFile.append("chrome");
    userChromeFile.append("userChrome.css");
    const userContentFile = profileDir.clone();
    userContentFile.append("chrome");
    userContentFile.append("userContent.css");
    Services.prefs.setBoolPref(
      "zen.workspaces.separate-essentials",
      Services.prefs.getBoolPref(
        "zen.workspaces.container-specific-essentials-enabled",
        false
      )
    );
    const theme = Services.prefs.getIntPref(
      "layout.css.prefers-color-scheme.content-override",
      0
    );
    Services.prefs.setIntPref("zen.view.window.scheme", theme);
    if (userChromeFile.exists() || userContentFile.exists()) {
      Services.prefs.setBoolPref(
        "toolkit.legacyUserProfileCustomizations.stylesheets",
        true
      );
      console.warn(
        "ZenUIMigration: User stylesheets detected, enabling legacy stylesheets."
      );
      this.shouldRestart = true;
    }
  }

  _migrateV2() {
    if (AppConstants.platform !== "linux") {
      Services.prefs.setIntPref("zen.theme.gradient-legacy-version", 0);
    }
  }

  _migrateV3() {
    if (
      Services.prefs
        .getStringPref("zen.theme.accent-color", "")
        .startsWith("system")
    ) {
      Services.prefs.setStringPref("zen.theme.accent-color", "AccentColor");
    }
  }

  _migrateV4() {
    // Fix spelling mistake in preference name
    Services.prefs.setBoolPref(
      "zen.theme.use-system-colors",
      Services.prefs.getBoolPref("zen.theme.use-sysyem-colors", false)
    );
  }

  _migrateV5() {
    Services.prefs.setBoolPref("zen.site-data-panel.show-callout", true);
  }

  _migrateV6() {
    lazy.SessionStore.promiseAllWindowsRestored.then(() => {
      const win = Services.wm.getMostRecentWindow("navigator:browser");
      win.setTimeout(async () => {
        const [title, message, learnMore, accept] =
          await win.document.l10n.formatMessages([
            "zen-window-sync-migration-dialog-title",
            "zen-window-sync-migration-dialog-message",
            "zen-window-sync-migration-dialog-learn-more",
            "zen-window-sync-migration-dialog-accept",
          ]);

        // buttonPressed will be 0 for cancel, 1 for "more info"
        let buttonPressed = Services.prompt.confirmEx(
          win,
          title.value,
          message.value,
          Services.prompt.BUTTON_POS_0 *
            Services.prompt.BUTTON_TITLE_IS_STRING +
            Services.prompt.BUTTON_POS_1 *
              Services.prompt.BUTTON_TITLE_IS_STRING,
          learnMore.value,
          accept.value,
          null,
          null,
          {}
        );
        // User has clicked on "Learn More"
        if (buttonPressed === 0) {
          win.openTrustedLinkIn(
            "https://docs.zen-browser.app/user-manual/window-sync",
            "tab"
          );
        }
      }, 1000);
    });
  }

  _migrateV7() {
    if (
      AppConstants.platform === "macosx" &&
      Services.prefs.prefHasUserValue(
        "widget.macos.sidebar-blend-mode.behind-window"
      ) &&
      !Services.prefs.getBoolPref(
        "widget.macos.sidebar-blend-mode.behind-window"
      )
    ) {
      Services.prefs.setBoolPref("zen.widget.macos.window-vibrancy", false);
    }
  }

  _migrateV8() {
    // A version mismatch in the downloadable gfx blocklist wrongly blocked
    // video overlays for every Windows user. The status pref persists in the
    // profile and short-circuits the blocklist evaluation, so clear it (and
    // its failure id) and restart, since gfx is already initialized by now.
    if (Services.prefs.prefHasUserValue("gfx.blacklist.video-overlay")) {
      Services.prefs.clearUserPref("gfx.blacklist.video-overlay");
      Services.prefs.clearUserPref("gfx.blacklist.video-overlay.failureid");
      this.shouldRestart = true;
    }
  }
}

export var gZenUIMigration = new nsZenUIMigration();
