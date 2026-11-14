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
import { NyxOpenIn } from "chrome://browser/content/nyx/NyxOpenIn.sys.mjs";

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

/** A button's view, made once per window where CustomizableUI looks for it; its module fills it. */
function simpleView(document, id, title) {
  if (document.getElementById(id)) {
    return;
  }
  const view = document.createXULElement("panelview");
  view.id = id;
  view.className = "PanelUI-subView";
  view.setAttribute("title", title);
  const body = document.createXULElement("vbox");
  body.className = "panel-subview-body";
  view.append(body);
  const cache = document.getElementById("appMenu-viewCache");
  (cache?.content ?? cache ?? document.getElementById("mainPopupSet")).appendChild(view);
}

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
    {
      // A middle click opens the page where Alt+Shift+O does, without the dropdown.
      id: "nyx-openin-button",
      l10nId: "nyx-openin-button",
      type: "view",
      viewId: NyxOpenIn.VIEW_ID,
      onBeforeCreated: document => NyxOpenIn.createView(document),
      onCreated: node =>
        node.addEventListener("click", event => {
          if (event.button === 1) {
            NyxOpenIn.openPreferred(NyxOpenIn.webAddress(windowOf(event).gBrowser.currentURI));
          }
        }),
      onViewShowing: event => NyxOpenIn.show(event.target),
    },
    {
      // Browser's VPN (vpn.js draws its panel).
      id: "nyx-vpn-button",
      l10nId: "nyx-vpn-button",
      type: "view",
      viewId: "PanelUI-nyx-vpn",
      onBeforeCreated: document => simpleView(document, "PanelUI-nyx-vpn", "VPN"),
      onViewShowing: event => windowOf(event).NyxVpnUI?.show(event.target),
    },
    {
      // Nyx Passwords' popup, built in: passwords.js loads Passwords' own page into the view.
      id: "nyx-passwords-button",
      l10nId: "nyx-passwords-button",
      type: "view",
      viewId: "PanelUI-nyx-passwords",
      onBeforeCreated: document => simpleView(document, "PanelUI-nyx-passwords", "Passwords"),
      onViewShowing: event => windowOf(event).NyxPasswordsUI?.popupView(event.target),
    },
  ],

  /**
   * The top bar from the mockups: navigation, the address field, Browser's actions, Nyx
   * Passwords, Firefox's extensions and downloads. More tools (Firefox's overflow), Settings and
   * the menu follow on their own (navigator-toolbox.inc.xhtml).
   */
  navbarPlacements: [
    "back-button",
    "forward-button",
    "stop-reload-button",
    "urlbar-container",
    "nyx-share-button",
    "nyx-capture-button",
    "nyx-assistant-button",
    "nyx-passwords-button",
    "unified-extensions-button",
    "nyx-vpn-button",
    "nyx-openin-button",
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
