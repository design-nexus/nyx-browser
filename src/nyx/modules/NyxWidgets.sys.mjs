/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser's own toolbar buttons, registered with CustomizableUI as built-in widgets by
// ZenCustomizableUI.startup, so they can be moved, removed and restored like Firefox's. Capture
// and Assistant press the Nyx extension's keyboard commands, so a button carries the same
// permissions as its shortcut. Share opens a dropdown of where it sends (NyxShareMenu), whose
// last row presses Share's command for the full Share window.

import { ShortcutUtils } from "resource://gre/modules/ShortcutUtils.sys.mjs";
import { NyxShareMenu } from "chrome://browser/content/nyx/NyxShareMenu.sys.mjs";

const KEYSET = "ext-keyset-id-nyx-integration_design-nexus_github_io";
// Each button's command, in the order of the extension's commands (its manifest).
const KEYS = { "nyx-share-button": 0, "nyx-capture-button": 1, "nyx-assistant-button": 2 };

const keyOf = (document, id) => document.getElementById(KEYSET)?.children[KEYS[id]];

const pressKey = id => event => keyOf(event.target.ownerDocument, id)?.doCommand();

// In More tools a button says its shortcut, as Firefox's menus do. The extension's shortcuts
// can be changed in Add-ons, so it's read when the button moves there.
const shortcutsInMoreTools = {
  onWidgetOverflow(node) {
    const key = node.id in KEYS && keyOf(node.ownerDocument, node.id);
    if (key) {
      node.setAttribute("shortcut", ShortcutUtils.prettifyShortcut(key));
    }
  },
  onWidgetUnderflow(node) {
    if (node.id in KEYS) {
      node.removeAttribute("shortcut");
    }
  },
};

const windowOf = event => event.target.documentGlobal;

export const NyxWidgets = {
  // Where they go by default. The nav bar's order is in navbarPlacements below.
  SIDEBAR_BUTTON: "nyx-sidebar-button",

  definitions: [
    {
      id: "nyx-sidebar-button",
      l10nId: "nyx-sidebar-button",
      defaultArea: "zen-sidebar-top-buttons",
      removable: false,
      onCommand: event => windowOf(event).NyxSidebar?.toggle(),
    },
    {
      id: "nyx-share-button",
      l10nId: "nyx-share-button",
      type: "view",
      viewId: NyxShareMenu.VIEW_ID,
      onBeforeCreated: document => {
        NyxShareMenu.createView(document, () => keyOf(document, "nyx-share-button")?.doCommand());
      },
      onViewShowing: event => NyxShareMenu.show(event.target),
    },
    { id: "nyx-capture-button", l10nId: "nyx-capture-button", onCommand: pressKey("nyx-capture-button") },
    { id: "nyx-assistant-button", l10nId: "nyx-assistant-button", onCommand: pressKey("nyx-assistant-button") },
  ],

  /**
   * The top bar from the mockups: navigation, the address field, Browser's actions, Nyx
   * Passwords, Firefox's extensions and downloads. More tools (Firefox's overflow), Settings and
   * the menu follow on their own (navigator-toolbox.inc.xhtml). Passwords' button is its
   * extension's; the place waits for it when Passwords isn't installed.
   */
  navbarPlacements: [
    "back-button",
    "forward-button",
    "stop-reload-button",
    "urlbar-container",
    "nyx-share-button",
    "nyx-capture-button",
    "nyx-assistant-button",
    "nyx-passwords_design-nexus_github_io-browser-action",
    "unified-extensions-button",
    "downloads-button",
  ],

  register(CustomizableUIInternal) {
    for (const definition of this.definitions) {
      CustomizableUIInternal.createBuiltinWidget({
        type: "button",
        defaultArea: "nav-bar",
        ...definition,
      });
    }
    CustomizableUIInternal.addListener(shortcutsInMoreTools);
  },
};
