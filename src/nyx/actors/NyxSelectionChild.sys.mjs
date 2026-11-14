/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Selection search, in the page: when a mouse selection ends (or, in Settings, with Alt held or
// on a middle click), it tells the window the text and where it is on screen, in device pixels.
// Text in a field the page is editing is the field's own business, and isn't offered.

const MODE = "nyx.selection.mode";
const MAX_TEXT = 2000;

export class NyxSelectionChild extends JSWindowActorChild {
  #shown = false;

  handleEvent(event) {
    switch (event.type) {
      case "mouseup":
        if (event.button === 0 || event.button === 1) {
          // The selection settles after the event (a double or triple click, a drag).
          const { button, altKey } = event;
          this.contentWindow?.setTimeout(() => this.#offer(button, altKey), 0);
        }
        break;
      case "mousedown":
      case "keydown":
      case "scroll":
      case "pagehide":
        this.#hide();
        break;
    }
  }

  #offer(button, altKey) {
    const mode = Services.prefs.getStringPref(MODE, "selection");
    const wanted = { selection: button === 0, alt: button === 0 && altKey, middle: button === 1 }[mode];
    if (!wanted) {
      return;
    }
    const win = this.contentWindow;
    const selection = win?.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length > MAX_TEXT || !selection.rangeCount || this.#editing(selection)) {
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      return;
    }
    const scale = win.devicePixelRatio;
    this.#shown = true;
    this.sendAsyncMessage("NyxSelection:Show", {
      text,
      host: this.document.location.host,
      left: (win.mozInnerScreenX + rect.left) * scale,
      right: (win.mozInnerScreenX + rect.right) * scale,
      top: (win.mozInnerScreenY + rect.top) * scale,
      bottom: (win.mozInnerScreenY + rect.bottom) * scale,
    });
  }

  #editing(selection) {
    const active = this.document.activeElement;
    if (active && (active.localName === "input" || active.localName === "textarea")) {
      return true;
    }
    const node = selection.anchorNode;
    const element = node?.nodeType === node?.ELEMENT_NODE ? node : node?.parentElement;
    return !!element?.isContentEditable;
  }

  #hide() {
    if (this.#shown) {
      this.#shown = false;
      this.sendAsyncMessage("NyxSelection:Hide");
    }
  }
}
