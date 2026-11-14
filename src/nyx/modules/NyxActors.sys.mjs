/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser's actors in web pages, registered once for the whole app by the first window.

let registered = false;

// resource: rather than chrome:, which web-page processes may not load.
const base = "resource://nyx/actors";

export const NyxActors = {
  register() {
    if (registered) {
      return;
    }
    registered = true;
    // Selection search: the selection's text and place, for the popup the window draws.
    ChromeUtils.registerWindowActor("NyxSelection", {
      parent: { esModuleURI: `${base}/NyxSelectionParent.sys.mjs` },
      child: {
        esModuleURI: `${base}/NyxSelectionChild.sys.mjs`,
        events: {
          mouseup: { mozSystemGroup: true },
          mousedown: { mozSystemGroup: true },
          keydown: { mozSystemGroup: true },
          scroll: { capture: true, mozSystemGroup: true },
          pagehide: {},
        },
      },
      matches: ["http://*/*", "https://*/*"],
      messageManagerGroups: ["browsers"],
      allFrames: true,
      // The child only reports what the page shows; the parent checks it before acting on it.
      safeForUntrustedWebProcess: true,
    });
    // Yes-or-no questions about a page's top frame, and Ctrl+Z on a page (NyxPageChild). In
    // every frame of every tab: Ctrl+Z works wherever the page is focused.
    ChromeUtils.registerWindowActor("NyxPage", {
      parent: { esModuleURI: `${base}/NyxPageParent.sys.mjs` },
      child: { esModuleURI: `${base}/NyxPageChild.sys.mjs`, events: { keydown: {} } },
      messageManagerGroups: ["browsers"],
      allFrames: true,
      safeForUntrustedWebProcess: true,
    });
    // Nyx Passwords: fields, fills, submitted logins and passkeys, in every frame of a tab. There
    // are no address patterns, so frames a page writes itself (about:blank) have it too; the
    // child acts only for web pages, and the parent checks each frame's address.
    ChromeUtils.registerWindowActor("NyxPasswords", {
      parent: { esModuleURI: `${base}/NyxPasswordsParent.sys.mjs` },
      child: {
        esModuleURI: `${base}/NyxPasswordsChild.sys.mjs`,
        events: {
          DOMWindowCreated: {},
          DOMContentLoaded: {},
          pageshow: {},
          pagehide: {},
          load: { capture: true },
          DOMFormHasPassword: {},
          DOMInputPasswordAdded: {},
          pointerdown: { capture: true, mozSystemGroup: true },
          keydown: { capture: true, mozSystemGroup: true },
          focusin: { capture: true, mozSystemGroup: true },
          focusout: { capture: true, mozSystemGroup: true },
          click: { capture: true, mozSystemGroup: true },
          submit: { capture: true, mozSystemGroup: true },
          scroll: { capture: true, mozSystemGroup: true },
        },
      },
      messageManagerGroups: ["browsers"],
      allFrames: true,
      safeForUntrustedWebProcess: true,
    });
  },
};
