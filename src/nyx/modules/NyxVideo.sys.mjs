/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Video downloads, with yt-dlp through the native host (video.rs in the bridge): what a page's
// video is (`video-info`), downloading it (`video-download`, which reports each step), and the
// downloads going on now, for every window's Downloads panel. A finished one joins Firefox's own
// downloads, so it shows in the panel and the Library like any other.

import { NyxBridge } from "chrome://browser/content/nyx/NyxBridge.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
});

const UNAVAILABLE = "Video downloads need yt-dlp.";
const PREFS = {
  quality: "nyx.video.quality",
  audio: "nyx.video.audio-format",
  folder: "nyx.video.folder",
  names: "nyx.video.names",
  embed: "nyx.video.embed",
  cookies: "nyx.video.cookies",
};

// Sites yt-dlp is made for, where the button shows before anything plays; elsewhere it shows
// once the page plays something.
const HOSTS = [
  "youtube.com", "youtu.be", "vimeo.com", "twitch.tv", "x.com", "twitter.com", "reddit.com", "tiktok.com",
  "instagram.com", "facebook.com", "dailymotion.com", "soundcloud.com", "bandcamp.com", "bilibili.com",
  "streamable.com", "rumble.com", "odysee.com", "nebula.tv", "archive.org", "ted.com", "kick.com", "bsky.app",
];

const infos = new Map();
const jobs = new Map();
const listeners = new Set();
let nextJob = 1;

function changed() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  }
}

/** The XDG Videos folder (user-dirs.dirs), else ~/Videos, else the downloads folder. */
async function videosFolder() {
  const home = Services.env.get("HOME");
  const config = Services.env.get("XDG_CONFIG_HOME") || PathUtils.join(home, ".config");
  try {
    const dirs = await IOUtils.readUTF8(PathUtils.join(config, "user-dirs.dirs"));
    const named = /^XDG_VIDEOS_DIR="(.+)"$/m.exec(dirs)?.[1]?.replace("$HOME", home);
    if (named && (await IOUtils.exists(named))) {
      return named;
    }
  } catch {}
  const videos = PathUtils.join(home, "Videos");
  return (await IOUtils.exists(videos)) ? videos : lazy.Downloads.getPreferredDownloadsDirectory();
}

const cookieArgs = () => (Services.prefs.getBoolPref(PREFS.cookies, true) ? ["--cookies", PathUtils.profileDir] : []);

export const NyxVideo = {
  HOSTS,

  /** Whether the button belongs on this page: a video site, or a page playing something. */
  offered(browser) {
    if (!Services.prefs.getBoolPref("nyx.video.offer", true)) {
      return false;
    }
    const uri = browser?.currentURI;
    if (!uri || !/^https?$/.test(uri.scheme)) {
      return false;
    }
    let host = "";
    try {
      host = uri.host;
    } catch {}
    if (HOSTS.some(h => host === h || host.endsWith(`.${h}`))) {
      return true;
    }
    return !!browser.browsingContext?.mediaController?.isActive;
  },

  /** What yt-dlp says the page's video is; remembered for the page's address. */
  info(url) {
    if (!infos.has(url)) {
      const reading = NyxBridge.run(["video-info", url, ...cookieArgs()], UNAVAILABLE);
      infos.set(url, reading);
      reading.catch(() => infos.delete(url));
    }
    return infos.get(url);
  },

  version() {
    return NyxBridge.run(["video-version"], UNAVAILABLE);
  },

  async folder() {
    const chosen = Services.prefs.getStringPref(PREFS.folder, "");
    return chosen && (await IOUtils.exists(chosen)) ? chosen : videosFolder();
  },

  defaults() {
    return {
      quality: Services.prefs.getStringPref(PREFS.quality, "1080p"),
      audio: Services.prefs.getStringPref(PREFS.audio, "opus"),
      names: Services.prefs.getStringPref(PREFS.names, "title-channel"),
      embed: Services.prefs.getBoolPref(PREFS.embed, true),
    };
  },

  jobs() {
    return [...jobs.values()];
  },

  onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * Downloads a page's video: `quality` is "best", "audio" or a height; `subtitles` embeds them.
   * The job reports each step to the Downloads panels and joins Firefox's downloads when done.
   */
  async download({ url, title, thumbnail, quality, subtitles, folder }) {
    const { audio, names, embed } = this.defaults();
    const target = folder || (await this.folder());
    const controller = new AbortController();
    const job = { id: nextJob++, url, title, thumbnail, quality, state: "starting", downloaded: 0, total: 0, speed: 0, eta: -1, controller };
    jobs.set(job.id, job);
    changed();
    const args = ["video-download", url, "--folder", target, "--quality", String(quality), "--audio", audio, "--names", names, ...cookieArgs()];
    if (subtitles) {
      args.push("--subtitles");
    }
    if (embed) {
      args.push("--embed");
    }
    try {
      const done = await NyxBridge.run(
        args,
        UNAVAILABLE,
        line => {
          if (line.t === "progress") {
            Object.assign(job, { state: "downloading", downloaded: line.downloaded, total: line.total, speed: line.speed, eta: line.eta });
          } else if (line.t === "stage") {
            job.state = line.stage;
          }
          changed();
        },
        { signal: controller.signal }
      );
      jobs.delete(job.id);
      changed();
      const info = await IOUtils.stat(done.file).catch(() => null);
      const download = await lazy.Downloads.createDownload({
        source: { url },
        target: { path: done.file },
        succeeded: true,
        totalBytes: info?.size ?? job.total,
      });
      (await lazy.Downloads.getList(lazy.Downloads.PUBLIC)).add(download);
      return done.file;
    } catch (error) {
      job.state = controller.signal.aborted ? "stopped" : "failed";
      job.error = error.message;
      changed();
      setTimeout(() => {
        jobs.delete(job.id);
        changed();
      }, controller.signal.aborted ? 1500 : 15000);
      return null;
    }
  },

  cancel(id) {
    jobs.get(id)?.controller.abort();
  },
};
