/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Nyx Passwords, for one frame: hands what NyxPasswordsChild reports to NyxPasswords with what
// Browser itself knows of the frame (its tab, its document's address), never the page's word.

import { NyxPasswords } from "chrome://browser/content/nyx/NyxPasswords.sys.mjs";

export class NyxPasswordsParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    const browser = this.browsingContext.top.embedderElement;
    if (!browser) {
      return null;
    }
    // A frame the page wrote itself (about:blank, srcdoc) is the page's: its principal's address.
    let frameUrl = this.manager.documentURI?.spec ?? "";
    if (!/^https?:/.test(frameUrl)) {
      const principal = this.manager.documentPrincipal;
      frameUrl = principal?.schemeIs("https") || principal?.schemeIs("http") ? principal.spec : "";
    }
    return NyxPasswords.fromFrame(name, data ?? {}, { browser, bc: this.browsingContext, frameUrl });
  }
}
