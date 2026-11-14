/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Video downloads in a window: the download button in the address field, on video sites and
 * pages playing something; its panel (the video, video or sound alone, the quality with sizes,
 * subtitles, the folder); and yt-dlp's downloads at the top of the Downloads panel, with their
 * progress, until they join the list as finished files. */
{
  const { NyxVideo } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxVideo.sys.mjs");
  const HTML = "http://www.w3.org/1999/xhtml";
  const ICONS = "chrome://browser/content/nyx/icons";

  const html = (tag, className, text) => {
    const node = document.createElementNS(HTML, tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  };
  const l10n = (node, id, args) => {
    document.l10n.setAttributes(node, id, args);
    return node;
  };
  const bytes = n => {
    if (!n) {
      return "";
    }
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (n >= 1000 && i < units.length - 1) {
      n /= 1000;
      i++;
    }
    return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
  };
  const clock = seconds => {
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
  };

  // ---- the button in the address field ----

  const button = document.createXULElement("hbox");
  button.id = "nyx-video-button";
  button.className = "urlbar-page-action";
  button.setAttribute("role", "button");
  button.setAttribute("tabindex", "0");
  button.hidden = true;
  document.l10n.setAttributes(button, "nyx-video-button");
  button.append(document.createXULElement("image"));
  button.firstChild.className = "urlbar-icon";
  (document.getElementById("nyx-qr-button") ?? document.getElementById("star-button-box"))?.before(button);

  /** The button shows on video sites, pages playing something, and pages with a player. */
  async function update() {
    const browser = gBrowser.selectedBrowser;
    if (NyxVideo.offered(browser)) {
      button.hidden = false;
      return;
    }
    button.hidden = true;
    if (!Services.prefs.getBoolPref("nyx.video.offer", true) || !/^https?:/.test(browser.currentURI.spec)) {
      return;
    }
    let found = false;
    try {
      found = await browser.browsingContext.currentWindowGlobal?.getActor("NyxPage").sendQuery("NyxPage:HasMedia");
    } catch {}
    if (browser === gBrowser.selectedBrowser) {
      button.hidden = !found;
    }
  }
  let watched = null;
  function watchMedia() {
    watched?.removeEventListener("activated", update);
    watched = gBrowser.selectedBrowser.browsingContext?.mediaController ?? null;
    watched?.addEventListener("activated", update);
    update();
  }

  button.addEventListener("click", event => event.button === 0 && openPanel());
  button.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPanel();
    }
  });

  // ---- its panel ----

  let panel = null;
  let body = null;

  function build() {
    panel = document.createXULElement("panel");
    panel.id = "nyx-video-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("role", "dialog");
    body = html("div", "nyx-video");
    panel.append(body);
    document.getElementById("mainPopupSet").append(panel);
  }

  async function openPanel() {
    if (!panel) {
      build();
    }
    const url = gBrowser.currentURI.spec;
    body.replaceChildren(l10n(html("p", "nyx-video-note"), "nyx-video-looking"));
    panel.openPopup(button, "bottomcenter topright", 0, 0);
    button.setAttribute("open", "true");
    panel.addEventListener("popuphidden", () => button.removeAttribute("open"), { once: true });
    try {
      const [info, version, folder] = await Promise.all([NyxVideo.info(url), NyxVideo.version().catch(() => ({})), NyxVideo.folder()]);
      if (gBrowser.currentURI.spec === url) {
        fill(url, info, version, folder);
      }
    } catch (error) {
      body.replaceChildren(html("p", "nyx-video-note nyx-video-error", error.message));
    }
  }

  function fill(url, info, version, startFolder) {
    const defaults = NyxVideo.defaults();
    let folder = startFolder;
    let mode = defaults.quality === "audio" ? "audio" : "video";
    const qualities = info.qualities ?? [];
    // The quality Settings starts on ("1080p"), or the nearest below it; "best" is the first.
    const wanted = parseInt(defaults.quality) || Infinity;
    const pick = qualities.find(q => q.height <= wanted) ?? qualities.at(-1);
    let quality = pick ? String(pick.height) : "best";

    const head = html("div", "nyx-video-head");
    const thumb = html("span", "nyx-video-thumb");
    if (info.thumbnail) {
      const img = html("img");
      img.src = info.thumbnail;
      img.alt = "";
      thumb.append(img);
    }
    if (info.duration) {
      thumb.append(html("i", null, clock(info.duration)));
    }
    const text = html("div", "nyx-video-text");
    text.append(html("b", null, info.title || gBrowser.selectedTab.label), html("small", null, [info.channel, gBrowser.currentURI.host].filter(Boolean).join(" · ")));
    head.append(thumb, text);

    const seg = html("div", "nyx-video-seg");
    const segButton = (value, id) => {
      const b = l10n(html("button"), id);
      b.addEventListener("click", () => {
        mode = value;
        render();
      });
      b.dataset.value = value;
      return b;
    };
    seg.append(segButton("video", "nyx-video-mode-video"), segButton("audio", "nyx-video-mode-audio"));

    const list = html("div", "nyx-video-list");
    const options = html("div", "nyx-video-options");
    const subs = html("button", "nyx-video-switch");
    subs.setAttribute("role", "switch");
    let subtitles = info.subtitles;
    subs.addEventListener("click", () => {
      subtitles = !subtitles;
      render();
    });
    const subsRow = html("div", "nyx-video-row");
    subsRow.append(img("subtitles"), l10n(html("span", "nyx-video-grow"), "nyx-video-subtitles"), subs);
    subsRow.hidden = !info.subtitles;
    const folderRow = html("div", "nyx-video-row");
    const folderText = html("span", "nyx-video-grow");
    const change = l10n(html("button", "nyx-video-small"), "nyx-video-change");
    change.addEventListener("click", async () => {
      const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
      fp.init(window.browsingContext, await document.l10n.formatValue("nyx-video-folder-title"), Ci.nsIFilePicker.modeGetFolder);
      const start = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      start.initWithPath(folder);
      fp.displayDirectory = start;
      fp.open(result => {
        if (result === Ci.nsIFilePicker.returnOK) {
          folder = fp.file.path;
          render();
        }
      });
    });
    folderRow.append(img("folder"), folderText, change);
    options.append(subsRow, folderRow);

    const foot = html("div", "nyx-video-foot");
    const ver = html("span", "nyx-video-version", version?.version ? `yt-dlp ${version.version}` : "");
    const cancel = l10n(html("button", "nyx-video-button"), "nyx-video-cancel");
    cancel.addEventListener("click", () => panel.hidePopup());
    const go = l10n(html("button", "nyx-video-button nyx-video-primary"), "nyx-video-download");
    go.addEventListener("click", () => {
      NyxVideo.download({ url, title: info.title, thumbnail: info.thumbnail, quality: mode === "audio" ? "audio" : quality, subtitles: subtitles && mode === "video", folder });
      panel.hidePopup();
      if (Services.prefs.getBoolPref("browser.download.alwaysOpenPanel", true)) {
        DownloadsPanel.showPanel();
      }
    });
    foot.append(ver, cancel, go);

    function render() {
      for (const b of seg.children) {
        b.toggleAttribute("nyx-on", b.dataset.value === mode);
      }
      list.replaceChildren();
      const row = (value, label, sub, size) => {
        const r = html("button", "nyx-video-quality");
        r.toggleAttribute("nyx-on", quality === value);
        r.append(html("span", "nyx-video-radio"), html("b", null, label), html("span", "nyx-video-grow nyx-video-dim", sub), html("span", "nyx-video-dim", bytes(size)));
        r.addEventListener("click", () => {
          quality = value;
          render();
        });
        list.append(r);
      };
      if (mode === "audio") {
        const r = html("div", "nyx-video-quality nyx-video-static");
        r.append(img("music"), l10n(html("span", "nyx-video-grow"), "nyx-video-audio-as", { format: defaults.audio.toUpperCase() }), html("span", "nyx-video-dim", bytes(info.audio_size)));
        list.append(r);
      } else if (!qualities.length) {
        quality = "best";
        const r = html("div", "nyx-video-quality nyx-video-static");
        r.append(l10n(html("span", "nyx-video-grow"), "nyx-video-best"));
        list.append(r);
      } else {
        for (const q of qualities.slice(0, 6)) {
          row(String(q.height), `${q.height}p`, q.height >= 2160 ? "4K" : q.height >= 1440 ? "QHD" : q.height >= 1080 ? "Full HD" : q.height >= 720 ? "HD" : "", q.size);
        }
      }
      subs.toggleAttribute("nyx-on", subtitles);
      subsRow.hidden = !info.subtitles || mode === "audio";
      folderText.replaceChildren(l10n(html("span"), "nyx-video-save-to"), html("small", null, folder.replace(Services.env.get("HOME"), "~")));
    }
    render();
    body.replaceChildren(head, seg, list, options, foot);
  }

  function img(name) {
    const node = html("img", "nyx-video-icon");
    node.src = `${ICONS}/${name}.svg`;
    node.alt = "";
    return node;
  }

  // ---- yt-dlp's downloads, at the top of the Downloads panel ----

  let jobsBox = null;
  function showJobs() {
    const list = document.getElementById("downloadsListBox");
    if (!list) {
      return;
    }
    if (!jobsBox) {
      jobsBox = html("div", "nyx-video-jobs");
      jobsBox.id = "nyx-video-jobs";
      list.before(jobsBox);
    }
    const jobs = NyxVideo.jobs();
    jobsBox.hidden = !jobs.length;
    jobsBox.replaceChildren(
      ...jobs.map(job => {
        const row = html("div", "nyx-video-job");
        const thumb = html("span", "nyx-video-thumb nyx-video-thumb-small");
        if (job.thumbnail) {
          const i = html("img");
          i.src = job.thumbnail;
          i.alt = "";
          thumb.append(i);
        }
        const text = html("div", "nyx-video-text");
        const bar = html("div", "nyx-video-progress");
        const fill = html("span");
        const pct = job.total ? Math.min(100, (job.downloaded / job.total) * 100) : 0;
        fill.style.width = `${job.state === "downloading" ? pct : 100}%`;
        bar.toggleAttribute("nyx-busy", ["starting", "merging", "converting", "finishing"].includes(job.state));
        bar.toggleAttribute("nyx-failed", job.state === "failed" || job.state === "stopped");
        bar.append(fill);
        const status = html("small");
        if (job.state === "downloading") {
          l10n(status, "nyx-video-progress", {
            done: bytes(job.downloaded),
            total: bytes(job.total) || "?",
            speed: job.speed ? `${bytes(job.speed)}/s` : "",
            left: job.eta >= 0 ? clock(job.eta) : "",
          });
        } else if (job.state === "failed") {
          status.textContent = job.error;
        } else {
          l10n(status, `nyx-video-state-${job.state}`);
        }
        text.append(html("b", null, job.title || job.url), bar, status);
        const stop = html("button", "nyx-video-stop");
        l10n(stop, "nyx-video-stop");
        stop.append(img("close"));
        stop.addEventListener("click", () => NyxVideo.cancel(job.id));
        stop.hidden = ["failed", "stopped"].includes(job.state);
        row.append(thumb, text, stop);
        return row;
      })
    );
  }
  const stopJobs = NyxVideo.onChange(showJobs);
  // Firefox makes the Downloads panel the first time it opens.
  document.addEventListener("popupshowing", event => event.target.id === "downloadsPanel" && showJobs(), true);

  // ---- following the tab ----

  // A page's players come as it loads, and some after: it's asked when it's done and again later.
  const STOP = Ci.nsIWebProgressListener.STATE_STOP | Ci.nsIWebProgressListener.STATE_IS_WINDOW;
  gBrowser.addProgressListener({
    onStateChange(webProgress, request, flags) {
      if (webProgress.isTopLevel && (flags & STOP) === STOP) {
        update();
        setTimeout(update, 3000);
      }
    },
    onLocationChange(webProgress) {
      if (webProgress.isTopLevel) {
        watchMedia();
        if (panel?.state === "open") {
          panel.hidePopup();
        }
      }
    },
  });
  gBrowser.tabContainer.addEventListener("TabSelect", watchMedia);
  Services.prefs.addObserver("nyx.video.offer", update);
  window.addEventListener(
    "unload",
    () => {
      stopJobs();
      Services.prefs.removeObserver("nyx.video.offer", update);
    },
    { once: true }
  );
  watchMedia();
}
