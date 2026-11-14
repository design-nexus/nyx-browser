/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// YouTube as Settings › YouTube asks (nyx.youtube.*), the few settings of Enhancer for YouTube
// that matter: theater mode always, no mini player, a default quality, speed and volume, the
// mouse wheel over the video for volume (Ctrl: speed), other tabs' videos paused when one plays,
// no "autoplay next", no cards or end screens, and Shorts in the normal player. YouTube's own
// player functions are called on its page objects; nothing of Browser's is left in the page.

const PREF = name => `nyx.youtube.${name}`;
const bool = name => Services.prefs.getBoolPref(PREF(name), false);
const string = name => Services.prefs.getStringPref(PREF(name), "");

// YouTube's quality levels, best first.
const LEVELS = ["highres", "hd2880", "hd2160", "hd1440", "hd1080", "hd720", "large", "medium", "small", "tiny"];
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

const CARDS_CSS = `.ytp-ce-element, .ytp-cards-teaser, .ytp-cards-button, .ytp-paid-content-overlay, .iv-branding, .annotation { display: none !important; }`;
const MINIPLAYER_CSS = `ytd-miniplayer, .ytp-miniplayer-button { display: none !important; }`;

export class NyxYouTubeChild extends JSWindowActorChild {
  #sheets = [];
  #tries = 0;

  get #player() {
    return this.document?.getElementById("movie_player")?.wrappedJSObject ?? null;
  }

  get #video() {
    return this.document?.querySelector("video.html5-main-video, #movie_player video") ?? null;
  }

  handleEvent(event) {
    switch (event.type) {
      case "DOMWindowCreated":
        this.#start();
        break;
    }
  }

  #start() {
    const window = this.contentWindow;
    if (!window) {
      return;
    }
    if (this.#shortsToWatch()) {
      return;
    }
    if (bool("theater") && this.browsingContext === this.browsingContext.top) {
      // YouTube opens a video wide when this cookie says the last one was.
      this.document.cookie = "wide=1; path=/; domain=.youtube.com; max-age=31536000; secure; samesite=lax";
    }
    this.#styles();
    // YouTube's own navigation event comes from its page code, so it's untrusted.
    window.addEventListener("yt-navigate-finish", () => this.#navigated(), { capture: false }, true);
    window.addEventListener("loadedmetadata", event => this.#loaded(event), { capture: true });
    window.addEventListener("play", event => this.#playing(event), { capture: true });
    window.addEventListener("wheel", event => this.#wheel(event), { capture: true, passive: false });
    window.addEventListener("DOMContentLoaded", () => this.#navigated(), { once: true });
  }

  #styles() {
    const utils = this.contentWindow.windowUtils;
    for (const sheet of this.#sheets) {
      utils.removeSheetUsingURIString(sheet, utils.AUTHOR_SHEET);
    }
    this.#sheets = [bool("hide-cards") && CARDS_CSS, bool("no-miniplayer") && MINIPLAYER_CSS]
      .filter(Boolean)
      .map(css => `data:text/css;charset=utf-8,${encodeURIComponent(css)}`);
    for (const sheet of this.#sheets) {
      utils.loadSheetUsingURIString(sheet, utils.AUTHOR_SHEET);
    }
  }

  /** A Shorts address, in the normal player: /shorts/ID becomes /watch?v=ID. */
  #shortsToWatch() {
    const location = this.contentWindow?.location;
    const match = /^\/shorts\/([\w-]{6,})/.exec(location?.pathname ?? "");
    if (!match || !bool("shorts-player") || this.browsingContext !== this.browsingContext.top) {
      return false;
    }
    location.replace(`/watch?v=${match[1]}`);
    return true;
  }

  #navigated() {
    if (this.#shortsToWatch()) {
      return;
    }
    const watching = this.contentWindow?.location.pathname === "/watch";
    if (!watching) {
      // Leaving a video: with no mini player, it stops rather than playing on out of sight.
      if (bool("no-miniplayer") && this.#video && !this.#video.paused && this.document.querySelector("ytd-miniplayer[active], ytd-miniplayer[enabled]")) {
        this.#video.pause();
      }
      return;
    }
    this.#tries = 0;
    this.#watchPage();
  }

  /** On a video's page: theater mode on, "autoplay next" off, once the player has drawn them. */
  #watchPage() {
    const document = this.document;
    const flexy = document?.querySelector("ytd-watch-flexy, ytd-watch-grid");
    const sizeButton = document?.querySelector(".ytp-size-button");
    if (!flexy || !sizeButton) {
      if (this.#tries++ < 20) {
        this.contentWindow?.setTimeout(() => this.#watchPage(), 250);
      }
      return;
    }
    if (bool("theater") && !flexy.hasAttribute("theater") && !flexy.hasAttribute("fullscreen")) {
      sizeButton.click();
    }
    if (bool("no-autoplay-next")) {
      const toggle = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
      toggle?.closest("button, .ytp-button")?.click();
    }
  }

  /** A new video: the default quality, speed and volume. */
  #loaded(event) {
    if (event.target !== this.#video) {
      return;
    }
    const player = this.#player;
    if (!player) {
      return;
    }
    try {
      const quality = string("quality");
      if (quality) {
        const levels = [...(player.getAvailableQualityLevels?.() ?? [])];
        const wanted = LEVELS.indexOf(quality);
        // The quality asked for, or the best below it.
        const level = levels.find(l => LEVELS.indexOf(l) >= wanted) ?? levels.at(-1);
        if (level && level !== "auto") {
          player.setPlaybackQualityRange?.(level, level);
          player.setPlaybackQuality?.(level);
        }
      }
      const speed = parseFloat(string("speed"));
      if (speed > 0) {
        player.setPlaybackRate?.(speed);
      }
      const volume = Services.prefs.getIntPref(PREF("volume"), -1);
      if (volume >= 0) {
        player.setVolume?.(Math.min(100, volume));
      }
    } catch (error) {
      console.error("Browser: YouTube's player didn't take a setting", error);
    }
  }

  #playing(event) {
    if (event.target?.localName === "video" && bool("pause-others")) {
      this.sendAsyncMessage("NyxYouTube:Playing");
    }
  }

  /** Over the video: the wheel changes the volume; with Ctrl, the speed. */
  #wheel(event) {
    if (!bool("wheel") || !event.deltaY || event.shiftKey || event.altKey || event.metaKey) {
      return;
    }
    const over = event.target?.closest?.("#movie_player, .html5-video-player");
    const player = this.#player;
    if (!over || !player || over.closest(".ytp-settings-menu, .ytp-popup")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const up = event.deltaY < 0;
    if (event.ctrlKey) {
      const rate = player.getPlaybackRate?.() ?? 1;
      const index = SPEEDS.findIndex(s => s >= rate);
      const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (index < 0 ? SPEEDS.length - 1 : index) + (up ? 1 : -1)))];
      player.setPlaybackRate?.(next);
      return;
    }
    const volume = player.getVolume?.() ?? 50;
    if (up && player.isMuted?.()) {
      player.unMute?.();
    }
    player.setVolume?.(Math.max(0, Math.min(100, Math.round(volume / 5) * 5 + (up ? 5 : -5))));
  }

  receiveMessage({ name }) {
    if (name === "NyxYouTube:Pause") {
      for (const video of this.document?.querySelectorAll("video") ?? []) {
        if (!video.paused) {
          video.pause();
        }
      }
    }
    return null;
  }
}
