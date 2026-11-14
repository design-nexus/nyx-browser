/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// What the window asks of a page's content, as plain yes or no: whether it has a video or a
// sound to download (video.js shows its button for players that start muted, which Firefox's
// media controller doesn't count). And Ctrl+Z on a page, outside text: Firefox's own page
// shortcuts take it for an undo there is nothing to undo in, so the window's key for it
// (Reopen closed tab, unless it's been changed) never hears it. The page goes first: a page or
// a text field that handles Ctrl+Z keeps it.

const PLAYERS = /^https:\/\/(www\.)?(youtube(-nocookie)?\.com\/embed|player\.vimeo\.com|player\.twitch\.tv|www\.dailymotion\.com\/embed)/;

export class NyxPageChild extends JSWindowActorChild {
  receiveMessage({ name }) {
    if (name !== "NyxPage:HasMedia" || !this.document) {
      return null;
    }
    const media = [...this.document.querySelectorAll("video, audio")].some(
      m => (m.currentSrc || m.src || m.querySelector("source")) && !(m.duration > 0 && m.duration < 2)
    );
    return media || [...this.document.querySelectorAll("iframe[src]")].some(f => PLAYERS.test(f.src));
  }

  handleEvent(event) {
    if (
      event.type !== "keydown" ||
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      !event.getModifierState("Accel") ||
      event.shiftKey ||
      event.altKey ||
      event.key.toLowerCase() !== "z"
    ) {
      return;
    }
    const target = event.composedTarget;
    const element = target?.nodeType === 1 ? target : target?.parentElement;
    if (
      this.document?.designMode === "on" ||
      element?.isContentEditable ||
      element?.closest("input, textarea, select")
    ) {
      return;
    }
    event.preventDefault();
    this.sendAsyncMessage("NyxPage:Shortcut", { key: "z" });
  }
}
