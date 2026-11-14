/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// A download as a row, the same in the Library's Downloads and the downloads panel: a tile for
// its kind, its name, its progress or how it ended, and what can be done with it (pause, resume,
// retry, show in its folder). Strings are browser/nyx-library.ftl's.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
});

const ICONS = "chrome://browser/content/nyx/icons";
const KIND = { video: /\.(mp4|webm|mkv|mov|avi|m4v)$/i, image: /\.(png|jpe?g|gif|webp|avif|svg|heic)$/i };

export const NyxDownloads = {
  leafOf: download => PathUtils.filename(download.target.path),

  kindOf(download) {
    const name = this.leafOf(download);
    return KIND.video.test(name) ? "video" : KIND.image.test(name) ? "image" : "file";
  },

  hostOf(url) {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch {
      return url;
    }
  },

  /**
   * A row for `download`, in `doc`. `remove` takes it off the list. The row's update() shows the
   * download as it is now; call it when it changes.
   */
  row(doc, download, remove) {
    const el = (tag, className, text) => {
      const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
      if (className) {
        node.className = className;
      }
      if (text !== undefined) {
        node.textContent = text;
      }
      return node;
    };
    const icon = name => {
      const img = el("img");
      img.src = `${ICONS}/${name}.svg`;
      img.alt = "";
      return img;
    };
    const iconButton = (name, l10nId, run) => {
      const node = el("button", "ibtn");
      node.append(icon(name));
      doc.l10n.setAttributes(node, l10nId);
      node.addEventListener("click", event => {
        event.stopPropagation();
        run();
      });
      return node;
    };

    const row = el("div", "row dl");
    const kind = this.kindOf(download);
    const tile = el("span", `tile ${{ video: "red", image: "amber", file: "blue" }[kind]}`);
    tile.append(icon({ video: "play", image: "image", file: "file" }[kind]));
    const text = el("div", "rt");
    const status = el("span", "status");
    const bar = el("div", "bar");
    bar.append(el("i"));
    text.append(el("b", "", this.leafOf(download)), bar, status);
    const end = el("div", "end");
    row.append(tile, text, end);
    row.addEventListener("click", () => download.succeeded && download.launch());

    row.update = () => {
      const host = this.hostOf(download.source.url);
      const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(download.endTime ?? download.startTime));
      bar.hidden = download.stopped;
      row.toggleAttribute("failed", !!download.error);
      if (!download.stopped) {
        bar.firstChild.style.width = `${download.hasProgress ? download.progress : 0}%`;
        status.textContent = lazy.DownloadUtils.getDownloadStatus(download.currentBytes, download.hasProgress ? download.totalBytes : -1, download.speed)[0];
        end.replaceChildren(iconButton("pause", "nyx-library-pause", () => download.cancel()));
      } else if (download.succeeded) {
        const [amount, unit] = lazy.DownloadUtils.convertByteUnits(download.target.size ?? download.totalBytes);
        status.textContent = [`${amount} ${unit}`, host, when].join(" · ");
        end.replaceChildren(iconButton("folder", "nyx-library-show-file", () => download.showContainingDirectory()));
      } else {
        doc.l10n.setAttributes(status, download.error ? "nyx-library-download-failed" : "nyx-library-download-stopped", { host, when });
        const again = el("button", "lnk");
        doc.l10n.setAttributes(again, download.error ? "nyx-library-retry" : "nyx-library-resume");
        again.addEventListener("click", event => {
          event.stopPropagation();
          download.start().catch(() => {});
        });
        end.replaceChildren(again, iconButton("close", "nyx-library-remove", () => remove(download)));
      }
    };
    row.update();
    return row;
  },
};
