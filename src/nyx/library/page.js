/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// about:library. Each section is the page's address hash: #history, #bookmarks, #downloads,
// #reading. Places and downloads keep everything; the page shows them and follows their changes.

const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
const { NyxLibrary } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxLibrary.sys.mjs");
const { NyxDownloads } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxDownloads.sys.mjs");

if (document.documentURI.startsWith("about:logins")) {
  location.replace("about:preferences#nyxPasswords");
}

const ICONS = "chrome://browser/content/nyx/icons";
const content = document.getElementById("content");
const actions = document.getElementById("actions");
const find = document.getElementById("find");
const l10n = document.l10n;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};
const icon = (name, className = "") => {
  const img = el("img", className);
  img.src = `${ICONS}/${name}.svg`;
  img.alt = "";
  return img;
};
const favicon = url => {
  const img = el("img", "fav");
  img.src = `page-icon:${url}`;
  img.alt = "";
  img.addEventListener("error", () => (img.src = `${ICONS}/globe.svg`), { once: true });
  return img;
};
const hostOf = url => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const top = () => window.browsingContext.topChromeWindow;
/** Opens a page from the Library: in a new tab, a background one with the middle button or Ctrl. */
const open = (url, event) => top()?.openTrustedLinkIn(url, event?.button === 1 || event?.ctrlKey || event?.metaKey ? "tabshifted" : "tab");
const button = (l10nId, iconName, onClick, className = "pbtn") => {
  const node = el("button", className);
  if (iconName) {
    node.append(icon(iconName));
  }
  const label = el("span");
  l10n.setAttributes(label, l10nId);
  node.append(label);
  node.addEventListener("click", onClick);
  return node;
};
const iconButton = (iconName, l10nId, onClick) => {
  const node = el("button", "ibtn");
  node.append(icon(iconName));
  l10n.setAttributes(node, l10nId);
  node.addEventListener("click", event => {
    event.stopPropagation();
    onClick(event);
  });
  return node;
};
const label = (l10nId, args) => {
  const node = el("div", "gl");
  l10n.setAttributes(node, l10nId, args);
  return node;
};
const card = rows => {
  const node = el("div", "card");
  node.append(...rows);
  return node;
};
const empty = l10nId => {
  const node = el("div", "empty");
  l10n.setAttributes(node, l10nId);
  return node;
};
async function ask(titleId, promptId, value = "", args) {
  const [title, prompt] = await l10n.formatValues([{ id: titleId }, { id: promptId, args }]);
  const box = { value };
  return Services.prompt.prompt(window, title, prompt, box, null, {}) ? box.value.trim() : null;
}

// ---- History: by day, each page once a day at its latest visit.

const DAY = 24 * 60 * 60 * 1000;
let historyLimit = 300;

async function history(query) {
  const db = await PlacesUtils.promiseDBConnection();
  const params = { limit: historyLimit };
  let where = "p.hidden = 0 AND v.visit_type NOT IN (0, 4, 7, 8, 9)";
  if (query) {
    where += " AND (p.title LIKE :q ESCAPE '/' OR p.url LIKE :q ESCAPE '/')";
    params.q = `%${query.replace(/[/%_]/g, "/$&")}%`;
  }
  const rows = await db.executeCached(
    `SELECT p.url, p.title, MAX(v.visit_date) AS visit
       FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
      WHERE ${where}
      GROUP BY p.id, date(v.visit_date / 1000000, 'unixepoch', 'localtime')
      ORDER BY visit DESC LIMIT :limit`,
    params
  );
  return rows.map(row => ({ url: row.getResultByName("url"), title: row.getResultByName("title"), when: new Date(row.getResultByName("visit") / 1000) }));
}

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const longDay = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

async function showHistory(query) {
  actions.replaceChildren(
    button("nyx-library-clear-history", "close", () => {
      const { Sanitizer } = ChromeUtils.importESModule("resource:///modules/Sanitizer.sys.mjs");
      Sanitizer.showUI(top());
    })
  );
  const visits = await history(query);
  if (!visits.length) {
    content.replaceChildren(empty(query ? "nyx-library-nothing-found" : "nyx-library-history-empty"));
    return;
  }
  const today = new Date().setHours(0, 0, 0, 0);
  const days = new Map();
  for (const visit of visits) {
    const day = new Date(visit.when).setHours(0, 0, 0, 0);
    if (!days.has(day)) {
      days.set(day, []);
    }
    days.get(day).push(visit);
  }
  const parts = [];
  for (const [day, list] of days) {
    if (day === today) {
      parts.push(label("nyx-library-today"));
    } else if (day === today - DAY) {
      parts.push(label("nyx-library-yesterday"));
    } else {
      parts.push(el("div", "gl", longDay.format(day)));
    }
    parts.push(
      card(
        list.map(visit => {
          const row = el("div", "row link");
          row.append(el("span", "tm", time.format(visit.when)), favicon(visit.url), el("b", "rt", visit.title || visit.url), el("span", "hs", hostOf(visit.url)));
          row.append(iconButton("close", "nyx-library-remove", () => PlacesUtils.history.remove(visit.url)));
          row.addEventListener("click", event => open(visit.url, event));
          row.addEventListener("auxclick", event => event.button === 1 && open(visit.url, event));
          return row;
        })
      )
    );
  }
  if (visits.length >= historyLimit) {
    parts.push(
      button("nyx-library-more", null, () => {
        historyLimit += 300;
        show();
      }, "pbtn more")
    );
  }
  content.replaceChildren(...parts);
}

// ---- Bookmarks: the folders as a tree, the one chosen as a list.

let folderGuid = PlacesUtils.bookmarks.toolbarGuid;
const ROOTS = [
  [PlacesUtils.bookmarks.toolbarGuid, "nyx-library-bookmarks-bar"],
  [PlacesUtils.bookmarks.menuGuid, "nyx-library-bookmarks-menu"],
  [PlacesUtils.bookmarks.unfiledGuid, "nyx-library-other-bookmarks"],
];

// ---- Import and back up: from another browser or a file, a copy made now, an earlier copy
// put back, all of them saved as a file. Firefox's Library window had these.

let openMenu = null;
function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}
document.addEventListener("click", closeMenu);
document.addEventListener("keydown", event => event.key === "Escape" && closeMenu());

/** A file picker over the Library: `mode` open or save, `filters` Firefox's or [name, pattern]. */
async function pickFile(titleId, mode, { filters = [], name = "", dir = null } = {}) {
  const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  picker.init(window.browsingContext, await l10n.formatValue(titleId), mode);
  for (const filter of filters) {
    if (Array.isArray(filter)) {
      picker.appendFilter(...filter);
    } else {
      picker.appendFilters(filter);
    }
  }
  if (name) {
    picker.defaultString = name;
  }
  if (dir) {
    picker.displayDirectory = dir;
  }
  return new Promise(resolve => picker.open(result => resolve(result === Ci.nsIFilePicker.returnCancel ? null : picker)));
}

async function restoreFrom(path) {
  const { BookmarkJSONUtils } = ChromeUtils.importESModule("resource://gre/modules/BookmarkJSONUtils.sys.mjs");
  const [title, body] = await l10n.formatValues([{ id: "nyx-library-restore-title" }, { id: "nyx-library-restore-body" }]);
  if (!/\.jsonlz4$|\.json$/i.test(path)) {
    Services.prompt.alert(window, title, await l10n.formatValue("nyx-library-restore-format"));
    return;
  }
  if (Services.prompt.confirm(window, title, body)) {
    await BookmarkJSONUtils.importFromFile(path, { replace: true }).catch(async () => Services.prompt.alert(window, title, await l10n.formatValue("nyx-library-restore-failed")));
  }
}

async function showImportMenu(anchor) {
  const { PlacesBackups } = ChromeUtils.importESModule("resource://gre/modules/PlacesBackups.sys.mjs");
  const desktop = Services.dirsvc.get("Desk", Ci.nsIFile);
  const menu = el("div", "menu");
  menu.addEventListener("click", event => event.stopPropagation());
  const item = (l10nId, iconName, run, args) => {
    const node = el("button", "mi");
    const text = el("span");
    l10n.setAttributes(text, l10nId, args);
    node.append(icon(iconName), text);
    node.addEventListener("click", () => {
      closeMenu();
      run();
    });
    menu.append(node);
  };
  const head = id => {
    const node = el("div", "mh");
    l10n.setAttributes(node, id);
    menu.append(node);
  };
  head("nyx-library-bring-in");
  item("nyx-library-import-browser", "browser", () => {
    const { MigrationUtils } = ChromeUtils.importESModule("resource:///modules/MigrationUtils.sys.mjs");
    MigrationUtils.showMigrationWizard(top(), { entrypoint: MigrationUtils.MIGRATION_ENTRYPOINTS.PLACES });
  });
  item("nyx-library-import-file", "file", async () => {
    const picked = await pickFile("nyx-library-import-file-title", Ci.nsIFilePicker.modeOpen, { filters: [Ci.nsIFilePicker.filterHTML] });
    if (picked?.fileURL) {
      const { BookmarkHTMLUtils } = ChromeUtils.importESModule("resource://gre/modules/BookmarkHTMLUtils.sys.mjs");
      await BookmarkHTMLUtils.importFromURL(picked.fileURL.spec).catch(console.error);
    }
  });
  menu.append(el("div", "msep"));
  head("nyx-library-keep-copy");
  item("nyx-library-backup", "download", async () => {
    const picked = await pickFile("nyx-library-backup-title", Ci.nsIFilePicker.modeSave, { filters: [["JSON", "*.json;*.jsonlz4"]], name: PlacesBackups.getFilenameForDate(), dir: desktop });
    if (picked) {
      await PlacesBackups.saveBookmarksToJSONFile(picked.file.path).catch(console.error);
    }
  });
  item("nyx-library-export", "openin", async () => {
    const picked = await pickFile("nyx-library-export-title", Ci.nsIFilePicker.modeSave, { filters: [Ci.nsIFilePicker.filterHTML], name: "bookmarks.html" });
    if (picked) {
      const { BookmarkHTMLUtils } = ChromeUtils.importESModule("resource://gre/modules/BookmarkHTMLUtils.sys.mjs");
      await BookmarkHTMLUtils.exportToFile(picked.file.path).catch(console.error);
    }
  });
  menu.append(el("div", "msep"));
  head("nyx-library-restore");
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });
  for (const file of (await PlacesBackups.getBackupFiles()).slice(0, 5)) {
    item("nyx-library-restore-backup", "history", () => restoreFrom(file), { date: date.format(PlacesBackups.getDateForFile(file)), count: PlacesBackups.getBookmarkCountForFile(file) ?? 0 });
  }
  item("nyx-library-restore-file", "undo", async () => {
    const picked = await pickFile("nyx-library-restore-title", Ci.nsIFilePicker.modeOpen, { filters: [["JSON", "*.json;*.jsonlz4"], Ci.nsIFilePicker.filterAll], dir: desktop });
    if (picked) {
      restoreFrom(picked.file.path);
    }
  });
  document.body.append(menu);
  const box = anchor.getBoundingClientRect();
  menu.style.top = `${box.bottom + 4}px`;
  menu.style.left = `${Math.max(8, box.right - menu.offsetWidth)}px`;
  openMenu = menu;
}

async function showBookmarks(query) {
  const importButton = button("nyx-library-import-backup", "download", event => {
    event.stopPropagation();
    const wasOpen = !!openMenu;
    closeMenu();
    if (!wasOpen) {
      showImportMenu(importButton);
    }
  });
  actions.replaceChildren(
    button("nyx-library-add", "plus", () => addBookmark()),
    button("nyx-library-new-folder", "folder", () => newFolder()),
    importButton
  );
  if (query) {
    const found = (await PlacesUtils.bookmarks.search(query)).filter(b => b.type === PlacesUtils.bookmarks.TYPE_BOOKMARK);
    content.replaceChildren(found.length ? card(found.map(bookmarkRow)) : empty("nyx-library-nothing-found"));
    return;
  }
  // Each root's whole tree in one query, the three at once; the folders and the chosen one's
  // list are read from them.
  const [reading, ...roots] = await Promise.all([NyxLibrary.readingList(), ...ROOTS.map(([guid]) => PlacesUtils.promiseBookmarksTree(guid).catch(() => null))]);
  const folders = new Map();
  const index = node => {
    folders.set(node.guid, node);
    for (const child of node.children ?? []) {
      if (child.type === PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER) {
        index(child);
      }
    }
  };
  roots.forEach(root => root && index(root));
  const tree = el("div", "card tree");
  const addFolder = (node, name, depth, isReading = false) => {
    const children = (node.children ?? []).filter(child => child.guid !== reading?.guid);
    if (depth === 0 && node.guid === PlacesUtils.bookmarks.menuGuid && !children.length) {
      return;
    }
    const item = el("button", "tr");
    const on = node.guid === folderGuid;
    item.toggleAttribute("selected", on);
    if (on) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
    item.style.paddingInlineStart = `${10 + depth * 16}px`;
    const title = el("span");
    if (name) {
      l10n.setAttributes(title, name);
    } else {
      title.textContent = node.title;
    }
    item.append(icon(isReading ? "reader" : "folder"), title, el("em", "", String(children.filter(c => c.type !== PlacesUtils.TYPE_X_MOZ_PLACE_SEPARATOR).length)));
    item.addEventListener("click", () => {
      folderGuid = node.guid;
      show();
    });
    tree.append(item);
    for (const child of children) {
      if (child.type === PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER) {
        addFolder(child, null, depth + 1);
      }
    }
  };
  ROOTS.forEach(([, name], i) => roots[i] && addFolder(roots[i], name, 0));
  const readingNode = reading && (folders.get(reading.guid) ?? (await PlacesUtils.promiseBookmarksTree(reading.guid).catch(() => null)));
  if (readingNode) {
    addFolder(readingNode, "nyx-library-reading", 0, true);
  }
  const node = folders.get(folderGuid) ?? (await PlacesUtils.promiseBookmarksTree(folderGuid).catch(() => null));
  if (!node) {
    folderGuid = PlacesUtils.bookmarks.toolbarGuid;
    return show();
  }
  const items = (node.children ?? []).filter(child => child.type !== PlacesUtils.TYPE_X_MOZ_PLACE_SEPARATOR && child.guid !== reading?.guid);
  const list = el("div", "list");
  list.append(
    items.length
      ? card(
          items.map(child =>
            child.type === PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER
              ? folderRow(child)
              : bookmarkRow({ guid: child.guid, url: child.uri, title: child.title })
          )
        )
      : empty("nyx-library-folder-empty")
  );
  const view = el("div", "bm");
  view.append(tree, list);
  content.replaceChildren(view);
}

function folderRow(folder) {
  const row = el("div", "row link");
  const tile = el("span", "tile accent");
  tile.append(icon("folder"));
  const text = el("div", "rt");
  const count = el("span");
  l10n.setAttributes(count, "nyx-library-folder-count", { count: (folder.children ?? []).filter(c => c.type === PlacesUtils.TYPE_X_MOZ_PLACE).length });
  text.append(el("b", "", folder.title), count);
  row.append(tile, text, icon("arrow-right", "dimi"));
  row.addEventListener("click", () => {
    folderGuid = folder.guid;
    show();
  });
  return row;
}

function bookmarkRow(bookmark) {
  const url = bookmark.url?.href ?? bookmark.url;
  const row = el("div", "row link");
  const text = el("div", "rt");
  text.append(el("b", "", bookmark.title || url), el("span", "", url.replace(/^https?:\/\/(www\.)?/, "")));
  row.append(favicon(url), text, iconButton("note", "nyx-library-edit", () => editBookmark(bookmark)), iconButton("close", "nyx-library-delete", () => PlacesUtils.bookmarks.remove(bookmark.guid)));
  row.addEventListener("click", event => open(url, event));
  row.addEventListener("auxclick", event => event.button === 1 && open(url, event));
  return row;
}

async function addBookmark() {
  const url = await ask("nyx-library-add-title", "nyx-library-add-url");
  if (!url) {
    return;
  }
  const fixed = Services.uriFixup.getFixupURIInfo(url).preferredURI?.spec;
  if (!fixed) {
    return;
  }
  const title = await ask("nyx-library-add-title", "nyx-library-add-name", hostOf(fixed));
  await PlacesUtils.bookmarks.insert({ parentGuid: folderGuid, url: fixed, title: title || hostOf(fixed) });
}

async function newFolder() {
  const title = await ask("nyx-library-new-folder-title", "nyx-library-new-folder-name");
  if (title) {
    const folder = await PlacesUtils.bookmarks.insert({ parentGuid: folderGuid, type: PlacesUtils.bookmarks.TYPE_FOLDER, title });
    folderGuid = folder.guid;
  }
}

async function editBookmark(bookmark) {
  const url = bookmark.url?.href ?? bookmark.url;
  const title = await ask("nyx-library-edit-title", "nyx-library-add-name", bookmark.title ?? "");
  if (title === null) {
    return;
  }
  const address = await ask("nyx-library-edit-title", "nyx-library-add-url", url);
  if (address === null) {
    return;
  }
  const fixed = Services.uriFixup.getFixupURIInfo(address).preferredURI?.spec ?? url;
  await PlacesUtils.bookmarks.update({ guid: bookmark.guid, title, url: fixed });
}

// ---- Downloads: in progress first, as Firefox keeps them; pause, resume, retry, show.

let downloadList = null;
const downloadRows = new Map();

const leafOf = download => NyxDownloads.leafOf(download);
const downloadRow = download => NyxDownloads.row(document, download, d => downloadList.remove(d));

async function showDownloads(query) {
  await downloadsReady;
  actions.replaceChildren(
    button("nyx-library-open-folder", "folder", async () => {
      const dir = await Downloads.getPreferredDownloadsDirectory();
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(dir);
      file.launch();
    })
  );
  const all = (await downloadList.getAll()).reverse();
  const shown = all.filter(download => !query || leafOf(download).toLowerCase().includes(query.toLowerCase()));
  downloadRows.clear();
  if (!shown.length) {
    content.replaceChildren(empty(query ? "nyx-library-nothing-found" : "nyx-library-downloads-empty"));
    return;
  }
  // In progress first, then the newest.
  shown.sort((a, b) => Number(a.stopped) - Number(b.stopped));
  content.replaceChildren(
    card(
      shown.map(download => {
        const row = downloadRow(download);
        downloadRows.set(download, row);
        return row;
      })
    )
  );
}

// ---- Reading list: pages saved from a tab's menu, opened in Reader view.

async function showReading(query) {
  actions.replaceChildren();
  const folder = await NyxLibrary.readingList();
  const tree = folder ? await PlacesUtils.promiseBookmarksTree(folder.guid) : null;
  const items = (tree?.children ?? []).filter(child => child.type === PlacesUtils.TYPE_X_MOZ_PLACE && (!query || `${child.title} ${child.uri}`.toLowerCase().includes(query.toLowerCase())));
  if (!items.length) {
    content.replaceChildren(empty(query ? "nyx-library-nothing-found" : "nyx-library-reading-empty"));
    return;
  }
  content.replaceChildren(
    card(
      items.map(item => {
        const row = el("div", "row link");
        const text = el("div", "rt");
        text.append(el("b", "", item.title || item.uri), el("span", "", hostOf(item.uri)));
        row.append(favicon(item.uri), text, iconButton("close", "nyx-library-remove", () => PlacesUtils.bookmarks.remove(item.guid)));
        const reader = `about:reader?url=${encodeURIComponent(item.uri)}`;
        row.addEventListener("click", event => open(reader, event));
        row.addEventListener("auxclick", event => event.button === 1 && open(reader, event));
        return row;
      })
    )
  );
}

// ---- The page.

const SHOW = { history: showHistory, bookmarks: showBookmarks, downloads: showDownloads, reading: showReading };
// about:downloads is the Library open on its downloads.
const section = () => {
  const hash = location.hash.slice(1);
  if (NyxLibrary.SECTIONS.includes(hash)) {
    return hash;
  }
  return document.documentURI.startsWith("about:downloads") ? "downloads" : "history";
};
let shown = null;

async function show() {
  const now = section();
  if (now !== shown) {
    shown = now;
    find.value = "";
    historyLimit = 300;
    l10n.setAttributes(find, `nyx-library-find-${now}`);
    for (const item of document.querySelectorAll(".nav-item")) {
      const on = item.dataset.section === now;
      item.toggleAttribute("selected", on);
      if (on) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    }
  }
  await SHOW[now](find.value.trim());
}

async function counts() {
  const db = await PlacesUtils.promiseDBConnection();
  const [row] = await db.executeCached("SELECT count(*) AS n FROM moz_bookmarks WHERE type = 1");
  const reading = await NyxLibrary.readingList();
  const readingCount = reading ? ((await PlacesUtils.promiseBookmarksTree(reading.guid)).children ?? []).length : 0;
  const set = (name, value) => (document.querySelector(`.nav-item[data-section="${name}"] .count`).textContent = value ? String(value) : "");
  set("bookmarks", row.getResultByName("n") - readingCount);
  set("downloads", (await downloadList.getAll()).length);
  set("reading", readingCount);
}

let pending = 0;
const soon = () => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    show();
    counts();
  }, 150);
};

for (const item of document.querySelectorAll(".nav-item")) {
  item.addEventListener("click", () => (location.hash = item.dataset.section));
}
window.addEventListener("hashchange", show);
find.addEventListener("input", soon);

// A section is drawn again only for what it shows: pages visited elsewhere don't redraw the
// bookmarks, and bookmarks changing don't redraw the history.
const placesEvents = ["page-visited", "history-cleared", "page-removed", "bookmark-added", "bookmark-removed", "bookmark-moved", "bookmark-title-changed", "bookmark-url-changed"];
const placesChanged = events => {
  const bookmarks = events.some(e => e.type.startsWith("bookmark-"));
  const history = events.some(e => !e.type.startsWith("bookmark-"));
  if ((history && shown === "history") || (bookmarks && (shown === "bookmarks" || shown === "reading"))) {
    soon();
  } else if (bookmarks) {
    clearTimeout(countsPending);
    countsPending = setTimeout(counts, 150);
  }
};
let countsPending = 0;
PlacesUtils.observers.addListener(placesEvents, placesChanged);
window.addEventListener("unload", () => PlacesUtils.observers.removeListener(placesEvents, placesChanged), { once: true });

// The downloads list loads beside the first section, not before it.
const downloadsReady = (async () => {
  downloadList = await Downloads.getList(Downloads.ALL);
  await downloadList.addView({
    onDownloadAdded: () => shown === "downloads" && soon(),
    onDownloadRemoved: () => shown === "downloads" && soon(),
    onDownloadChanged: download => downloadRows.get(download)?.update(),
  });
})();

await show();
await downloadsReady;
counts();
