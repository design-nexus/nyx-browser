/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The downloads panel as the mockups have it: a head with how many are downloading and Show all
 * (the Library's Downloads), those in progress under Now and the recent ones by day, each as a
 * card of rows, and a foot with the folder and Clear list. Firefox's panel holds it, and opens it
 * as it does its own list. */
{
  const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
  const { NyxDownloads } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxDownloads.sys.mjs");
  const { DownloadUtils } = ChromeUtils.importESModule("resource://gre/modules/DownloadUtils.sys.mjs");
  const HTML = "http://www.w3.org/1999/xhtml";
  const ICONS = "chrome://browser/content/nyx/icons";
  const SHOWN = 6;
  const DAY = 24 * 60 * 60 * 1000;

  const el = (tag, className, text) => {
    const node = document.createElementNS(HTML, tag);
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
  const link = (l10nId, run) => {
    const node = el("button", "lnk");
    document.l10n.setAttributes(node, l10nId);
    node.addEventListener("click", run);
    return node;
  };

  let list = null;
  let box = null;
  const rows = new Map();

  async function view() {
    if (box) {
      return box;
    }
    MozXULElement.insertFTLIfNeeded("browser/nyx-library.ftl");
    box = el("div", "nyx-dl");
    box.id = "nyx-dl";
    document.getElementById("downloadsPanel-mainView").prepend(box);
    list = await Downloads.getList(Downloads.ALL);
    await list.addView({
      onDownloadAdded: () => fill(),
      onDownloadRemoved: () => fill(),
      onDownloadChanged: download => (rows.get(download)?.update(), head()),
    });
    return box;
  }

  let all = [];
  function head() {
    const going = all.filter(d => !d.stopped);
    const bytes = going.reduce((sum, d) => sum + (d.hasProgress ? d.totalBytes : 0), 0);
    const [amount, unit] = DownloadUtils.convertByteUnits(bytes);
    const sub = box.querySelector(".nyx-dl-sub");
    if (sub) {
      document.l10n.setAttributes(sub, going.length ? "nyx-dl-downloading" : "nyx-dl-files", { count: going.length || all.length, amount, unit });
    }
  }

  async function fill() {
    if (!box) {
      return;
    }
    all = (await list.getAll()).reverse();
    rows.clear();
    const top = el("div", "nyx-dl-head");
    const tile = el("span", "nyx-dl-tile");
    tile.append(icon("download"));
    const titles = el("div", "nyx-dl-titles");
    const title = el("b");
    document.l10n.setAttributes(title, "nyx-library-downloads");
    titles.append(title, el("span", "nyx-dl-sub"));
    top.append(
      tile,
      titles,
      link("nyx-dl-show-all", () => {
        PanelMultiView.hidePopup(document.getElementById("downloadsPanel"));
        window.NyxLibraryUI.open("downloads");
      })
    );
    const parts = [top];
    const shown = [...all.filter(d => !d.stopped), ...all.filter(d => d.stopped)].slice(0, SHOWN);
    if (!shown.length) {
      const empty = el("div", "nyx-dl-empty");
      document.l10n.setAttributes(empty, "nyx-library-downloads-empty");
      parts.push(empty);
    }
    const today = new Date().setHours(0, 0, 0, 0);
    const groups = [
      ["nyx-dl-now", shown.filter(d => !d.stopped)],
      ["nyx-library-today", shown.filter(d => d.stopped && new Date(d.endTime ?? d.startTime) >= today)],
      ["nyx-library-yesterday", shown.filter(d => d.stopped && new Date(d.endTime ?? d.startTime) < today && new Date(d.endTime ?? d.startTime) >= today - DAY)],
      ["nyx-dl-earlier", shown.filter(d => d.stopped && new Date(d.endTime ?? d.startTime) < today - DAY)],
    ];
    for (const [l10nId, downloads] of groups) {
      if (!downloads.length) {
        continue;
      }
      const card = el("div", "nyx-dl-card");
      const label = el("div", "nyx-dl-label");
      document.l10n.setAttributes(label, l10nId);
      card.append(label);
      for (const download of downloads) {
        const row = NyxDownloads.row(document, download, d => list.remove(d));
        rows.set(download, row);
        card.append(row);
      }
      parts.push(card);
    }
    const foot = el("div", "nyx-dl-foot");
    const folder = el("button", "nyx-dl-folder");
    folder.append(icon("folder"), el("span", "", ""));
    Downloads.getPreferredDownloadsDirectory().then(dir => (folder.lastChild.textContent = dir.replace(Services.env.get("HOME"), "~")));
    folder.addEventListener("click", async () => {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(await Downloads.getPreferredDownloadsDirectory());
      file.launch();
    });
    foot.append(folder, link("nyx-dl-clear", () => list.removeFinished()));
    parts.push(foot);
    box.replaceChildren(...parts);
    head();
  }

  // Firefox makes the panel the first time it opens it.
  window.addEventListener(
    "popupshowing",
    async event => {
      if (event.target.id === "downloadsPanel") {
        await view();
        fill();
      }
    },
    true
  );
}
