/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Selection search, in the window: hands the page's selection to the window's popup
// (selection.js), which shows it only for the tab in front.

export class NyxSelectionParent extends JSWindowActorParent {
  receiveMessage({ name, data }) {
    const browser = this.browsingContext.top.embedderElement;
    const search = this.browsingContext.topChromeWindow?.NyxSelectionSearch;
    if (!browser || !search) {
      return;
    }
    if (name === "NyxSelection:Show") {
      search.show(browser, data);
    } else {
      search.hide(browser);
    }
  }
}
