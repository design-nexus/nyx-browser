/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The window's side of NyxYouTubeChild: a YouTube video started playing, so the ones in other
// tabs pause.

export class NyxYouTubeParent extends JSWindowActorParent {
  receiveMessage({ name }) {
    if (name !== "NyxYouTube:Playing") {
      return;
    }
    const mine = this.browsingContext.top;
    for (const window of Services.wm.getEnumerator("navigator:browser")) {
      for (const browser of window.gBrowser?.browsers ?? []) {
        const top = browser.browsingContext;
        if (!top || top === mine) {
          continue;
        }
        for (const context of top.getAllBrowsingContextsInSubtree()) {
          context.currentWindowGlobal?.getExistingActor("NyxYouTube")?.sendAsyncMessage("NyxYouTube:Pause");
        }
      }
    }
  }
}
