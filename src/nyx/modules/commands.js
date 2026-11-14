/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Quick Commands, as Vivaldi has them: F2 opens one search over the open tabs, bookmarks and
 * history, Browser's commands and its settings. Arrows choose, Enter opens, Escape closes. */
{
  const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
  const { NyxOpenIn } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxOpenIn.sys.mjs");
  const HTML = "http://www.w3.org/1999/xhtml";
  const ICONS = "chrome://browser/content/nyx/icons";
  const MAX = 5;

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

  const press = id => () => document.getElementById(id)?.doCommand?.() ?? document.getElementById(id)?.click();
  /** The keys of a <key> as they are now, after any change in Settings › Keyboard Shortcuts. */
  const keysOf = id => () => {
    const key = document.getElementById(id);
    return key?.getAttribute("key") || key?.getAttribute("keycode") ? ShortcutUtils.prettifyShortcut(key) : "";
  };
  /** Browser's commands: the label's Fluent id, its icon, what it does, and its keys. */
  const COMMANDS = [
    ["nyx-qc-new-tab", "plus", () => BrowserCommands.openTab(), "Ctrl+T"],
    ["nyx-qc-new-window", "browser", () => OpenBrowserWindow(), "Ctrl+N"],
    ["nyx-qc-private-window", "private", () => OpenBrowserWindow({ private: true }), "Ctrl+Shift+P"],
    ["nyx-qc-close-tab", "close", () => gBrowser.removeTab(gBrowser.selectedTab), "Ctrl+W"],
    ["nyx-qc-reopen-tab", "undo", () => undoCloseTab(), keysOf("key_restoreLastClosedTabOrWindowOrSession")],
    ["nyx-qc-duplicate-tab", "copy", () => duplicateTabIn(gBrowser.selectedTab, "tab")],
    ["nyx-qc-pin-tab", "pin", () => (gBrowser.selectedTab.pinned ? gBrowser.unpinTab(gBrowser.selectedTab) : gBrowser.pinTab(gBrowser.selectedTab))],
    ["nyx-qc-unload-others", "moon", () => gBrowser.explicitUnloadTabs(gBrowser.visibleTabs.filter(t => !t.selected && !t.pinned && !t.soundPlaying))],
    ["nyx-qc-open-in", "openin", () => NyxOpenIn.openPreferred(NyxOpenIn.webAddress(gBrowser.currentURI)), "Alt+Shift+O"],
    ["nyx-qc-video", "videodl", press("nyx-video-button")],
    ["nyx-qc-share", "share", press("nyx-share-button"), "Alt+Shift+S"],
    ["nyx-qc-qr", "qr", press("nyx-qr-button")],
    ["nyx-qc-passwords", "key", () => window.NyxPasswordsUI?.openPopup(), "Alt+Shift+Y"],
    ["nyx-qc-sidebar", "sidebar", () => window.NyxSidebar?.toggle(), "Ctrl+B"],
    ["nyx-qc-downloads", "download", () => DownloadsPanel.showDownloadsHistory()],
    ["nyx-qc-bookmarks", "bookmark", () => PlacesCommandHook.showPlacesOrganizer("AllBookmarks"), "Ctrl+Shift+O"],
    ["nyx-qc-history", "history", () => PlacesCommandHook.showPlacesOrganizer("History"), "Ctrl+Shift+H"],
    ["nyx-qc-settings", "settings", () => openPreferences(), "Ctrl+,"],
  ];
  /** Settings' panes, by their Fluent title. */
  const PANES = [
    ["pane-nyx-appearance-title", "paneNyxAppearance"],
    ["pane-nyx-tabs-title", "paneNyxTabs"],
    ["pane-nyx-toolbar-title", "paneNyxToolbar"],
    ["pane-nyx-selection-title", "paneNyxSelection"],
    ["pane-nyx-downloads-title", "paneNyxDownloads"],
    ["pane-nyx-integrations-title", "paneNyxIntegrations"],
    ["pane-nyx-passwords-title", "paneNyxPasswords"],
    ["pane-nyx-blocking-title", "paneNyxBlocking"],
    ["pane-nyx-vpn-title", "paneNyxVpn"],
    ["pane-search-title", "paneSearch"],
    ["pane-privacy-title", "panePrivacy"],
  ];
  const strings = new Localization(["browser/nyx-browser.ftl", "browser/preferences/nyx-preferences.ftl", "browser/preferences/preferences.ftl"]);
  let labels = null;
  async function readLabels() {
    labels ??= Promise.all([
      strings.formatValues(COMMANDS.map(([id]) => ({ id }))),
      strings.formatValues(PANES.map(([id]) => ({ id }))),
      strings.formatValues(["nyx-qc-tabs", "nyx-qc-places", "nyx-qc-commands", "nyx-qc-settings-group", "nyx-qc-placeholder", "nyx-qc-switch"].map(id => ({ id }))),
    ]);
    return labels;
  }

  let panel = null;
  let input = null;
  let list = null;
  let rows = [];
  let at = 0;
  let asked = 0;

  function build() {
    panel = document.createXULElement("panel");
    panel.id = "nyx-quick-commands";
    panel.setAttribute("role", "dialog");
    const box = html("div", "nyx-qc");
    const head = html("div", "nyx-qc-input");
    const mark = html("img", "nyx-qc-mark");
    mark.src = `${ICONS}/command.svg`;
    mark.alt = "";
    input = html("input");
    input.type = "text";
    input.spellcheck = false;
    head.append(mark, input, html("kbd", null, "F2"));
    list = html("div", "nyx-qc-list");
    box.append(head, list);
    panel.append(box);
    document.getElementById("mainPopupSet").append(panel);
    input.addEventListener("input", () => search(input.value));
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        choose(at + (event.key === "ArrowDown" ? 1 : -1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        rows[at]?.run();
      } else if (event.key === "Escape") {
        panel.hidePopup();
      }
    });
  }

  function choose(index) {
    if (!rows.length) {
      return;
    }
    at = (index + rows.length) % rows.length;
    rows.forEach((row, i) => row.node.toggleAttribute("nyx-on", i === at));
    rows[at].node.scrollIntoView({ block: "nearest" });
  }

  const matches = (text, words) => !!text && words.every(w => text.toLowerCase().includes(w));
  const hostOf = uri => {
    try {
      return uri.displayHost || uri.spec;
    } catch {
      return uri.spec;
    }
  };

  async function places(words) {
    if (!words.length) {
      return [];
    }
    const db = await PlacesUtils.promiseDBConnection();
    const like = words.map((_, i) => `(IFNULL(h.title, '') LIKE :w${i} ESCAPE '/' OR h.url LIKE :w${i} ESCAPE '/')`).join(" AND ");
    const params = Object.fromEntries(words.map((w, i) => [`w${i}`, `%${db.escapeStringForLIKE(w, "/")}%`]));
    const found = await db.executeCached(
      `SELECT h.url, h.title, EXISTS (SELECT 1 FROM moz_bookmarks b WHERE b.fk = h.id) AS bookmarked
       FROM moz_places h WHERE ${like} AND (h.visit_count > 0 OR bookmarked) AND h.hidden = 0
       ORDER BY bookmarked DESC, h.frecency DESC LIMIT ${MAX}`,
      params
    );
    return found.map(r => ({ url: r.getResultByName("url"), title: r.getResultByName("title"), bookmarked: !!r.getResultByName("bookmarked") }));
  }

  async function search(query) {
    const mine = ++asked;
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const [commandLabels, paneLabels, [tabsTitle, placesTitle, commandsTitle, settingsTitle, , switchLabel]] = await readLabels();
    const tabs = gBrowser.tabs
      .filter(t => !t.closing && (!words.length || matches(`${t.label} ${t.linkedBrowser.currentURI.spec}`, words)))
      .slice(0, words.length ? MAX : 6);
    const found = await places(words).catch(() => []);
    if (mine !== asked) {
      return;
    }
    const commands = COMMANDS.map((c, i) => ({ c, label: commandLabels[i] })).filter(({ label }) => label && (!words.length || matches(label, words))).slice(0, words.length ? MAX : 4);
    const panes = words.length ? PANES.map((p, i) => ({ p, label: paneLabels[i] })).filter(({ label }) => matches(label, words)).slice(0, 3) : [];

    rows = [];
    list.replaceChildren();
    const group = title => list.append(html("div", "nyx-qc-group", title));
    const row = (icon, title, sub, key, run) => {
      const node = html("button", "nyx-qc-row");
      const img = html("img", "nyx-qc-icon");
      img.src = icon;
      img.alt = "";
      node.append(img, html("span", "nyx-qc-title", title), html("span", "nyx-qc-sub", sub ?? ""));
      if (key) {
        node.append(html("kbd", null, key));
      }
      const go = () => {
        panel.hidePopup();
        run();
      };
      node.addEventListener("click", go);
      node.addEventListener("mousemove", () => choose(rows.findIndex(r => r.node === node)));
      list.append(node);
      rows.push({ node, run: go });
    };
    if (tabs.length) {
      group(tabsTitle);
      for (const tab of tabs) {
        row(tab.getAttribute("image") || `${ICONS}/browser.svg`, tab.label, hostOf(tab.linkedBrowser.currentURI), switchLabel, () => {
          gBrowser.selectedTab = tab;
          window.focus();
        });
      }
    }
    if (found.length) {
      group(placesTitle);
      for (const p of found) {
        row(`${ICONS}/${p.bookmarked ? "bookmark" : "history"}.svg`, p.title || p.url, new URL(p.url).host, "", () => openTrustedLinkIn(p.url, "tab"));
      }
    }
    if (commands.length) {
      group(commandsTitle);
      for (const { c: [, icon, run, key], label } of commands) {
        row(`${ICONS}/${icon}.svg`, label, "", typeof key === "function" ? key() : key, run);
      }
    }
    if (panes.length) {
      group(settingsTitle);
      for (const { p: [, pane], label } of panes) {
        row(`${ICONS}/settings.svg`, label, "", "", () => openPreferences(pane));
      }
    }
    choose(0);
  }

  async function open() {
    if (!panel) {
      build();
    }
    const [, , [, , , , placeholder]] = await readLabels();
    input.placeholder = placeholder;
    input.value = "";
    await search("");
    // Across the top of the window, in the middle.
    const width = 680;
    const x = window.screenX + (window.outerWidth - width) / 2;
    const y = window.screenY + 96;
    panel.openPopupAtScreen(x, y, false);
    panel.addEventListener("popupshown", () => input.focus(), { once: true });
  }

  window.addEventListener(
    "keydown",
    event => {
      if (event.key === "F2" && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        if (panel?.state === "open") {
          panel.hidePopup();
        } else {
          open();
        }
      }
    },
    true
  );
  window.NyxQuickCommands = { open };
}
