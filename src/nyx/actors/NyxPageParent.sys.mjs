/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The window's side of NyxPageChild: it asks with sendQuery, and runs the window's key for a
// Ctrl+Z the page didn't use.

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

/** The modifiers of a <key>, as "accel" or "accel,shift"; Control is Accel off macOS. */
function modifiersOf(key) {
  const mac = AppConstants.platform === "macosx";
  return [
    ...new Set(
      (key.getAttribute("modifiers") || "")
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(m => (m === "control" && !mac ? "accel" : m))
    ),
  ]
    .sort()
    .join(",");
}

export class NyxPageParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    if (name !== "NyxPage:Shortcut" || data?.key !== "z") {
      return;
    }
    const window = this.browsingContext.topChromeWindow;
    if (!window || this.browsingContext.top.embedderElement !== window.gBrowser?.selectedBrowser) {
      return;
    }
    const document = window.document;
    for (const key of document.querySelectorAll('key[key="z" i]')) {
      if (modifiersOf(key) !== "accel" || key.getAttribute("internal") === "true" || key.getAttribute("disabled") === "true") {
        continue;
      }
      const command = key.getAttribute("command");
      (command ? document.getElementById(command) : key)?.doCommand();
      return;
    }
  }
}
