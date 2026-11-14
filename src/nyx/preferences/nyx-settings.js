/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser's settings panes. Prefs bind through Firefox's Preferences; theme, accent and density go
 * to appearance.json and the Nyx apps to integrations.json, the files the native host and Nyx
 * Settings read. */

/* import-globals-from /browser/components/preferences/preferences.js */

// Firefox's General pane registers some of the same prefs, and a second registration throws.
const nyxPrefs = [
  { id: "zen.tabs.vertical", type: "bool" },
  { id: "nyx.layout", type: "string" },
  { id: "nyx.sidebar.mode", type: "string" },
  { id: "nyx.effects.frosted", type: "bool" },
  { id: "nyx.toolbar.qr-button", type: "bool" },
  { id: "nyx.bookmarks.icons-only", type: "bool" },
  { id: "browser.toolbars.bookmarks.visibility", type: "string" },
  { id: "nyx.tabs.middle-click-close", type: "bool" },
  { id: "browser.tabs.closeWindowWithLastTab", type: "bool", inverted: true },
  { id: "nyx.sidebar.foot-spaces", type: "bool" },
  { id: "zen.view.compact.show-sidebar-and-toolbar-on-hover", type: "bool" },
  { id: "browser.link.open_newwindow.override.external", type: "int" },
  { id: "browser.tabs.warnOnClose", type: "bool" },
  { id: "nyx.tabs.close-buttons", type: "string" },
  { id: "nyx.tabs.overflow", type: "string" },
  { id: "toolkit.tabbox.switchByScrolling", type: "bool" },
  { id: "browser.tabs.hoverPreview.enabled", type: "bool" },
  { id: "zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url", type: "bool" },
  { id: "browser.ctrlTab.sortByRecentlyUsed", type: "bool" },
  { id: "nyx.tabs.unload-after", type: "int" },
  { id: "nyx.tabs.unload-pinned", type: "bool" },
  { id: "browser.sessionstore.restore_on_demand", type: "bool" },
  { id: "browser.startup.page", type: "int" },
  { id: "nyx.selection.mode", type: "string" },
  { id: "nyx.selection.textbox", type: "bool" },
  { id: "nyx.selection.icon-size", type: "string" },
  { id: "nyx.selection.open", type: "string" },
  { id: "nyx.youtube.theater", type: "bool" },
  { id: "nyx.youtube.no-miniplayer", type: "bool" },
  { id: "nyx.youtube.quality", type: "string" },
  { id: "nyx.youtube.speed", type: "string" },
  { id: "nyx.youtube.wheel", type: "bool" },
  { id: "nyx.youtube.pause-others", type: "bool" },
  { id: "nyx.youtube.no-autoplay-next", type: "bool" },
  { id: "nyx.youtube.hide-cards", type: "bool" },
  { id: "nyx.youtube.shorts-player", type: "bool" },
  { id: "nyx.passwords.fill-on-load", type: "bool" },
  { id: "nyx.passwords.field-icons", type: "bool" },
  { id: "nyx.passwords.inline-menu", type: "bool" },
  { id: "nyx.passwords.copy-totp", type: "bool" },
  { id: "nyx.passwords.offer-save", type: "bool" },
  { id: "nyx.passwords.remember-sign-in", type: "bool" },
  { id: "nyx.passwords.passkeys", type: "bool" },
  { id: "nyx.passwords.passkey-auto", type: "bool" },
  { id: "browser.download.useDownloadDir", type: "bool", inverted: true },
  { id: "browser.download.alwaysOpenPanel", type: "bool" },
  { id: "nyx.video.offer", type: "bool" },
  { id: "nyx.video.quality", type: "string" },
  { id: "nyx.video.audio-format", type: "string" },
  { id: "nyx.video.names", type: "string" },
  { id: "nyx.video.embed", type: "bool" },
  { id: "nyx.video.cookies", type: "bool" },
  { id: "nyx.vpn.kill-switch", type: "bool" },
  { id: "nyx.vpn.remote-dns", type: "bool" },
  { id: "nyx.vpn.webrtc", type: "bool" },
  { id: "privacy.query_stripping.enabled", type: "bool" },
  { id: "pdfjs.disabled", type: "bool" },
  { id: "browser.translations.automaticallyPopup", type: "bool" },
  { id: "layers.acceleration.disabled", type: "bool", inverted: true },
  { id: "layout.css.prefers-color-scheme.content-override", type: "int" },
  { id: "browser.newtabpage.enabled", type: "bool" },
  { id: "browser.search.suggest.enabled", type: "bool" },
  { id: "zen.urlbar.suggestions.quick-actions", type: "bool" },
  { id: "network.cookie.cookieBehavior", type: "int" },
  { id: "places.history.enabled", type: "bool" },
  { id: "network.trr.mode", type: "int" },
  { id: "privacy.globalprivacycontrol.enabled", type: "bool" },
  { id: "media.autoplay.default", type: "int" },
  { id: "dom.disable_open_during_load", type: "bool" },
  { id: "xpinstall.whitelist.required", type: "bool" },
  { id: "apz.allow_zooming", type: "bool" },
  { id: "general.smoothScroll", type: "bool" },
  { id: "general.autoScroll", type: "bool" },
  { id: "middlemouse.paste", type: "bool" },
  { id: "services.sync.engine.bookmarks", type: "bool" },
  { id: "services.sync.engine.history", type: "bool" },
  { id: "services.sync.engine.tabs", type: "bool" },
  { id: "services.sync.engine.addons", type: "bool" },
  { id: "services.sync.engine.prefs", type: "bool" },
];
for (const pref of nyxPrefs) {
  if (!Preferences.get(pref.id)) {
    Preferences.add(pref);
  }
}

const nyxHome = path => path.replace(Services.env.get("HOME"), "~");

/** Asks for a folder, starting at `start`, and gives its path to `done`. */
async function nyxChooseFolder(titleId, start, done) {
  const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  fp.init(window.browsingContext, await document.l10n.formatValue(titleId), Ci.nsIFilePicker.modeGetFolder);
  const dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  dir.initWithPath(start);
  fp.displayDirectory = dir;
  fp.open(result => result === Ci.nsIFilePicker.returnOK && done(fp.file.path));
}

/** Dialog accept/cancel live in the XUL <dialog> shadow root; document sheets don't reach them. */
const NYX_DIALOG_SHADOW_CSS = `
  .buttonBox button,
  button[dlgtype] {
    min-height: 30px !important;
    margin: 0 4px !important;
    padding: 0 14px !important;
    border: 0 !important;
    border-radius: 8px !important;
    appearance: none !important;
    -moz-appearance: none !important;
    background: var(--nyx-tile, #1a1b22) !important;
    color: var(--nyx-text, #e7e8ee) !important;
    font: 500 13px var(--nyx-font, inherit) !important;
  }
  button[dlgtype="accept"],
  button[default="true"] {
    background: var(--nyx-accent, #3d8ae8) !important;
    color: var(--nyx-on-accent, #0d0e12) !important;
    font-weight: 600 !important;
  }
`;

function nyxThemeDialogShadows(doc) {
  if (!doc) {
    return;
  }
  for (const dialog of doc.querySelectorAll("dialog")) {
    const root = dialog.shadowRoot;
    if (!root || root.querySelector(".nyx-subdialog-shadow")) {
      continue;
    }
    const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.className = "nyx-subdialog-shadow";
    style.textContent = NYX_DIALOG_SHADOW_CSS;
    root.append(style);
  }
}

function nyxWatchSubDialogs() {
  const stack = document.getElementById("dialogStack");
  if (!stack || stack._nyxThemed) {
    return;
  }
  stack._nyxThemed = true;
  const theme = () => {
    for (const frame of stack.querySelectorAll("browser, iframe")) {
      try {
        const doc = frame.contentDocument;
        if (!doc) {
          continue;
        }
        nyxThemeDialogShadows(doc);
        doc.addEventListener("DOMContentLoaded", () => nyxThemeDialogShadows(doc), { once: true });
      } catch {
        /* cross-process frame */
      }
    }
  };
  new MutationObserver(theme).observe(stack, { childList: true, subtree: true });
  stack.addEventListener("dialogopen", () => {
    theme();
    setTimeout(theme, 50);
    setTimeout(theme, 200);
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", nyxWatchSubDialogs, { once: true });
} else {
  nyxWatchSubDialogs();
}

/** Opens one of Firefox's dialogs over Settings. */
const nyxDialog = (url, params, closingCallback) => {
  nyxWatchSubDialogs();
  const opened = gSubDialog.open(url, { features: "resizable=yes", closingCallback }, params);
  const theme = () => {
    const stack = document.getElementById("dialogStack");
    for (const frame of stack?.querySelectorAll("browser, iframe") ?? []) {
      nyxThemeDialogShadows(frame.contentDocument);
    }
  };
  setTimeout(theme, 0);
  setTimeout(theme, 100);
  setTimeout(theme, 400);
  return opened;
};

const gNyxFiles = {
  config(name) {
    const home = Services.env.get("XDG_CONFIG_HOME") || PathUtils.join(Services.env.get("HOME"), ".config");
    return PathUtils.join(home, "nyx-browser", name);
  },

  async read(name) {
    try {
      return { ok: true, value: await IOUtils.readJSON(this.config(name)) };
    } catch (error) {
      return { ok: error.name === "NotFoundError", value: {} };
    }
  },

  async write(name, value) {
    const file = this.config(name);
    await IOUtils.makeDirectory(PathUtils.parent(file), { ignoreExisting: true });
    await IOUtils.writeJSON(file, value, { tmpPath: `${file}.tmp` });
  },
};

var gNyxAppearancePane = {
  async init() {
    // Dialog buttons before any await: register_module does not await init.
    document.getElementById("nyxAllThemes").addEventListener("command", () => window.browsingContext.topChromeWindow.BrowserAddonUI.openAddonsMgr("addons://list/theme"));
    document.getElementById("nyxFonts").addEventListener("command", () => nyxDialog("chrome://browser/content/preferences/dialogs/fonts.xhtml"));
    const { NyxTheme } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxTheme.sys.mjs");
    const saved = await NyxTheme.choices();
    // The theme and accent are lists of the Nyx themes and their swatches (the Themes page has
    // them as pictures); the density is a segmented control.
    const themes = document.getElementById("nyxTheme");
    const accent = document.getElementById("nyxAccent");
    const item = (value, l10nId, args, labelText) => {
      const node = document.createXULElement("menuitem");
      node.value = value;
      if (labelText) {
        node.setAttribute("label", labelText);
      } else {
        document.l10n.setAttributes(node, l10nId, args);
      }
      return node;
    };
    const data = await NyxTheme.themes().catch(() => null);
    themes.menupopup.replaceChildren(
      item("follow", "nyx-appearance-theme-follow-name", { name: data?.system.name ?? "" }),
      document.createXULElement("menuseparator"),
      ...(data?.themes ?? []).map(theme => item(theme.id, null, null, theme.name))
    );
    accent.menupopup.replaceChildren(
      item("", "nyx-appearance-accent-default"),
      ...(data?.accents ?? []).map(swatch => item(swatch.name, `nyx-appearance-accent-${swatch.name}`))
    );
    for (const [control, key, fallback] of [[themes, "theme", "follow"], [accent, "accent", ""], [document.getElementById("nyxDensity"), "density", ""]]) {
      control.value = saved[key] || fallback;
      control.addEventListener("command", () => NyxTheme.choose({ [key]: control.value }));
    }
  },
};

/**
 * A segmented control or list that stands for several prefs at once: `read` says which choice the
 * prefs make now, and each choice's entry in `choices` is the prefs it sets.
 */
function nyxChoice(id, choices, read) {
  const control = document.getElementById(id);
  const show = () => (control.value = read());
  show();
  control.addEventListener("command", () => {
    for (const [pref, value] of Object.entries(choices[control.value] ?? {})) {
      if (typeof value === "boolean") {
        Services.prefs.setBoolPref(pref, value);
      } else {
        Services.prefs.setStringPref(pref, value);
      }
    }
  });
  for (const pref of new Set(Object.values(choices).flatMap(Object.keys))) {
    Services.prefs.addObserver(pref, show);
    window.addEventListener("unload", () => Services.prefs.removeObserver(pref, show), { once: true });
  }
}

const nyxBool = pref => Services.prefs.getBoolPref(pref, false);

/** A switch that stands for something other than one pref: `read` says if it's on, `write` sets it. */
function nyxSwitch(id, read, write, prefs) {
  const box = document.getElementById(id);
  const show = () => (box.checked = read());
  show();
  box.addEventListener("command", () => write(box.checked));
  for (const pref of prefs) {
    Services.prefs.addObserver(pref, show);
    window.addEventListener("unload", () => Services.prefs.removeObserver(pref, show), { once: true });
  }
}

var gNyxTabsPane = {
  init() {
    this.containers.init();
    nyxChoice(
      "nyxNewTabPosition",
      {
        next: { "browser.tabs.insertAfterCurrent": true, "browser.tabs.insertRelatedAfterCurrent": true },
        related: { "browser.tabs.insertAfterCurrent": false, "browser.tabs.insertRelatedAfterCurrent": true },
        end: { "browser.tabs.insertAfterCurrent": false, "browser.tabs.insertRelatedAfterCurrent": false },
      },
      () => {
        if (nyxBool("browser.tabs.insertAfterCurrent")) {
          return "next";
        }
        return nyxBool("browser.tabs.insertRelatedAfterCurrent") ? "related" : "end";
      }
    );
    nyxChoice(
      "nyxBookmarksOpen",
      {
        tab: { "browser.tabs.loadBookmarksInTabs": true, "browser.tabs.loadBookmarksInBackground": false },
        background: { "browser.tabs.loadBookmarksInTabs": true, "browser.tabs.loadBookmarksInBackground": true },
        current: { "browser.tabs.loadBookmarksInTabs": false },
      },
      () => {
        if (!nyxBool("browser.tabs.loadBookmarksInTabs")) {
          return "current";
        }
        return nyxBool("browser.tabs.loadBookmarksInBackground") ? "background" : "tab";
      }
    );
    nyxChoice(
      "nyxUrlbarOpen",
      {
        current: { "browser.urlbar.openintab": false, "browser.search.openintab": false },
        tab: { "browser.urlbar.openintab": true, "browser.search.openintab": true },
      },
      () => (nyxBool("browser.urlbar.openintab") ? "tab" : "current")
    );
    // Closing a tab: Firefox goes back to its opener, Zen to the last used, and Browser can go
    // left; with all three off Firefox goes right.
    nyxChoice(
      "nyxAfterClose",
      {
        recent: { "zen.tabs.select-recently-used-on-close": true, "browser.tabs.selectOwnerOnClose": false, "nyx.tabs.select-left-on-close": false },
        left: { "zen.tabs.select-recently-used-on-close": false, "browser.tabs.selectOwnerOnClose": false, "nyx.tabs.select-left-on-close": true },
        right: { "zen.tabs.select-recently-used-on-close": false, "browser.tabs.selectOwnerOnClose": false, "nyx.tabs.select-left-on-close": false },
        opener: { "zen.tabs.select-recently-used-on-close": false, "browser.tabs.selectOwnerOnClose": true, "nyx.tabs.select-left-on-close": false },
      },
      () => {
        if (nyxBool("nyx.tabs.select-left-on-close")) {
          return "left";
        }
        if (nyxBool("zen.tabs.select-recently-used-on-close")) {
          return "recent";
        }
        return nyxBool("browser.tabs.selectOwnerOnClose") ? "opener" : "right";
      }
    );
    nyxChoice(
      "nyxDoubleClick",
      {
        rename: { "zen.tabs.rename-tabs": true, "browser.tabs.closeTabByDblclick": false, "nyx.tabs.double-click": "" },
        close: { "browser.tabs.closeTabByDblclick": true, "nyx.tabs.double-click": "" },
        pin: { "zen.tabs.rename-tabs": false, "browser.tabs.closeTabByDblclick": false, "nyx.tabs.double-click": "pin" },
        unload: { "zen.tabs.rename-tabs": false, "browser.tabs.closeTabByDblclick": false, "nyx.tabs.double-click": "unload" },
        none: { "zen.tabs.rename-tabs": false, "browser.tabs.closeTabByDblclick": false, "nyx.tabs.double-click": "" },
      },
      () => {
        if (nyxBool("browser.tabs.closeTabByDblclick")) {
          return "close";
        }
        const own = Services.prefs.getStringPref("nyx.tabs.double-click", "");
        if (own) {
          return own;
        }
        return nyxBool("zen.tabs.rename-tabs") ? "rename" : "none";
      }
    );
    // Focus's bookmarks shelf: shown, folded to its heading, or not there.
    nyxChoice(
      "nyxShelf",
      {
        shown: { "browser.toolbars.bookmarks.visibility": "always", "nyx.bookmarks.shelf-folded": false },
        folded: { "browser.toolbars.bookmarks.visibility": "always", "nyx.bookmarks.shelf-folded": true },
        hidden: { "browser.toolbars.bookmarks.visibility": "never" },
      },
      () => {
        if (Services.prefs.getStringPref("browser.toolbars.bookmarks.visibility", "always") === "never") {
          return "hidden";
        }
        return nyxBool("nyx.bookmarks.shelf-folded") ? "folded" : "shown";
      }
    );
    document.getElementById("nyxCustomize").addEventListener("command", () => {
      window.browsingContext.topChromeWindow?.gCustomizeMode.enter();
    });
    // "In this layout": the rows of the layout in use.
    const showLayout = () => {
      const layout = Services.prefs.getStringPref("nyx.layout", "studio");
      for (const row of document.querySelectorAll("#nyxInLayoutGroup [data-layouts]")) {
        row.hidden = !row.dataset.layouts.split(" ").includes(layout);
      }
    };
    Services.prefs.addObserver("nyx.layout", showLayout);
    window.addEventListener("unload", () => Services.prefs.removeObserver("nyx.layout", showLayout), { once: true });
    showLayout();
  },

  // Containers: Firefox's, with their colours and icons, made and changed here. A container's
  // tabs keep their own cookies; Manage Containers in a menu leads here (paneContainers).
  containers: {
    COLOURS: { blue: "#37adff", turquoise: "#00c79a", green: "#51cd00", yellow: "#ffcb00", orange: "#ff9f00", red: "#ff613d", pink: "#ff4bda", purple: "#af51f5" },
    ICONS: ["fingerprint", "briefcase", "dollar", "cart", "vacation", "gift", "food", "fruit", "pet", "tree", "chill", "circle", "fence"],

    init() {
      const { ContextualIdentityService } = ChromeUtils.importESModule(
        "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs"
      );
      this.service = ContextualIdentityService;
      const group = document.getElementById("nyxContainersGroup");
      const showGroup = () => {
        group.hidden = !Services.prefs.getBoolPref("privacy.userContext.enabled", false);
      };
      showGroup();
      Services.prefs.addObserver("privacy.userContext.enabled", showGroup);
      window.addEventListener("unload", () => Services.prefs.removeObserver("privacy.userContext.enabled", showGroup), { once: true });
      document.getElementById("nyxContainersNew").addEventListener("command", async () => {
        try {
          const [name] = await document.l10n.formatValues([{ id: "nyx-containers-new-name" }]);
          const made = this.service.create(name, "circle", "blue");
          this.show(made.userContextId);
        } catch (error) {
          console.error("Nyx containers: could not create a container", error);
        }
      });
      const changed = () => this.show(this.editing);
      for (const topic of ["contextual-identity-created", "contextual-identity-updated", "contextual-identity-deleted"]) {
        Services.obs.addObserver(changed, topic);
      }
      window.addEventListener("unload", () => {
        for (const topic of ["contextual-identity-created", "contextual-identity-updated", "contextual-identity-deleted"]) {
          Services.obs.removeObserver(changed, topic);
        }
      }, { once: true });
      this.show();
    },

    tile(identity) {
      const tile = document.createXULElement("image");
      tile.className = "nyx-container-tile";
      tile.setAttribute("src", `resource://usercontext-content/${identity.icon}.svg`);
      tile.style.setProperty("--c", this.COLOURS[identity.color] ?? "var(--nyx-dim)");
      return tile;
    },

    /** The list; `editing` is the container whose row is open to change. */
    show(editing = null) {
      this.editing = editing;
      const list = document.getElementById("nyxContainersList");
      list.replaceChildren(...this.service.getPublicIdentities().map(identity => (identity.userContextId === editing ? this.editor(identity) : this.row(identity))));
    },

    row(identity) {
      const row = document.createXULElement("hbox");
      row.className = "nyx-list-row";
      row.setAttribute("align", "center");
      const text = document.createXULElement("vbox");
      text.className = "nyx-row-text";
      text.setAttribute("flex", "1");
      const name = document.createXULElement("label");
      name.setAttribute("value", this.service.getUserContextLabel(identity.userContextId));
      const note = document.createXULElement("description");
      note.className = "nyx-row-note";
      document.l10n.setAttributes(note, "nyx-containers-tabs", { count: this.service.countContainerTabs(identity.userContextId) });
      text.append(name, note);
      const edit = document.createXULElement("button");
      document.l10n.setAttributes(edit, "nyx-containers-edit");
      edit.addEventListener("command", () => this.show(identity.userContextId));
      const remove = document.createXULElement("button");
      document.l10n.setAttributes(remove, "nyx-containers-remove");
      remove.addEventListener("command", () => this.remove(identity));
      row.append(this.tile(identity), text, edit, remove);
      return row;
    },

    editor(identity) {
      const box = document.createXULElement("vbox");
      box.className = "nyx-list-row nyx-container-editor";
      const top = document.createXULElement("hbox");
      top.setAttribute("align", "center");
      const input = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
      input.className = "nyx-container-name";
      input.value = this.service.getUserContextLabel(identity.userContextId);
      document.l10n.setAttributes(input, "nyx-containers-name");
      const done = document.createXULElement("button");
      done.className = "nyx-primary";
      document.l10n.setAttributes(done, "nyx-containers-done");
      const save = change => this.service.update(identity.userContextId, change.name ?? (input.value.trim() || this.service.getUserContextLabel(identity.userContextId)), change.icon ?? identity.icon, change.color ?? identity.color);
      done.addEventListener("command", () => {
        save({});
        this.show();
      });
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          save({});
          this.show();
        }
      });
      const spacer = document.createXULElement("spacer");
      spacer.setAttribute("flex", "1");
      top.append(this.tile(identity), input, spacer, done);
      const choices = (labelId, values, make) => {
        // HTML flex row — XUL hbox stretches the pickers into wide ovals.
        const line = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        line.className = "nyx-container-choices";
        const label = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
        label.className = "nyx-container-choices-label";
        document.l10n.setAttributes(label, labelId);
        line.append(label, ...values.map(make));
        return line;
      };
      const colours = choices("nyx-containers-colour", Object.keys(this.COLOURS), colour => {
        const dot = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
        dot.className = "nyx-container-dot";
        dot.style.setProperty("--c", this.COLOURS[colour]);
        dot.toggleAttribute("selected", colour === identity.color);
        dot.title = colour;
        dot.addEventListener("click", () => save({ color: colour }));
        return dot;
      });
      const icons = choices("nyx-containers-icon", this.ICONS, icon => {
        const button = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
        button.className = "nyx-container-icon";
        button.toggleAttribute("selected", icon === identity.icon);
        button.title = icon;
        const img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
        img.src = `resource://usercontext-content/${icon}.svg`;
        img.alt = "";
        button.append(img);
        button.addEventListener("click", () => save({ icon }));
        return button;
      });
      box.append(top, colours, icons);
      queueMicrotask(() => input.focus());
      return box;
    },

    async remove(identity) {
      const count = this.service.countContainerTabs(identity.userContextId);
      const [title, body] = await document.l10n.formatValues([
        { id: "nyx-containers-remove-title" },
        { id: "nyx-containers-remove-body", args: { name: this.service.getUserContextLabel(identity.userContextId), count } },
      ]);
      if (!Services.prompt.confirm(window, title, body)) {
        return;
      }
      if (count) {
        await this.service.closeContainerTabs(identity.userContextId);
      }
      this.service.remove(identity.userContextId);
    },
  },
};

/**
 * A comma-separated pref shown as chips, each with a button to remove it, and an Add button that
 * asks for one more. `note` is shown while the list is empty.
 */
function nyxChips({ pref, box, add, note, ask, normalize = value => value.trim().toLowerCase() }) {
  const container = document.getElementById(box);
  const read = () => Services.prefs.getStringPref(pref, "").split(",").map(s => s.trim()).filter(Boolean);
  const write = values => Services.prefs.setStringPref(pref, [...new Set(values)].join(","));
  const show = () => {
    const values = read();
    container.replaceChildren(
      ...values.map(value => {
        const chip = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
        chip.className = "nyx-chip";
        chip.textContent = value;
        const remove = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
        remove.className = "nyx-chip-remove";
        document.l10n.setAttributes(remove, "nyx-chip-remove", { name: value });
        remove.addEventListener("click", () => write(read().filter(v => v !== value)));
        chip.append(remove);
        return chip;
      })
    );
    if (note) {
      document.getElementById(note).hidden = values.length > 0;
    }
  };
  document.getElementById(add).addEventListener("command", async () => {
    const [title, prompt] = await document.l10n.formatValues(ask);
    const value = { value: "" };
    if (Services.prompt.prompt(window, title, prompt, value, null, {}) && normalize(value.value)) {
      write([...read(), normalize(value.value)]);
    }
  });
  Services.prefs.addObserver(pref, show);
  window.addEventListener("unload", () => Services.prefs.removeObserver(pref, show), { once: true });
  show();
}

const nyxSiteAsk = [{ id: "nyx-chip-add-site-title" }, { id: "nyx-chip-add-site-prompt" }];
const nyxHost = value => {
  const text = value.trim().toLowerCase();
  try {
    return new URL(text.includes("://") ? text : `https://${text}`).hostname;
  } catch {
    return "";
  }
};

const nyxSearchService = () =>
  ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs").SearchService;

var gNyxSelectionPane = {
  init() {
    nyxChips({ pref: "nyx.selection.off-sites", box: "nyxSelectionOffSites", add: "nyxSelectionOffAdd", note: "nyxSelectionOffNone", ask: nyxSiteAsk, normalize: nyxHost });
    document.getElementById("nyxSelectionManage").addEventListener("command", () => gotoPref("search"));
    this.showEngines();
    Services.obs.addObserver(this, "browser-search-engine-modified");
    window.addEventListener("unload", () => Services.obs.removeObserver(this, "browser-search-engine-modified"), { once: true });
  },

  observe() {
    this.showEngines();
  },

  list(pref) {
    return Services.prefs.getStringPref(pref, "").split(",").filter(Boolean);
  },

  /** Every engine as a row: drag it to reorder, switch it off to leave it out of the popup. */
  async showEngines() {
    const foot = document.getElementById("nyxSelectionEnginesFoot");
    const box = foot.parentNode;
    const hidden = new Set(this.list("nyx.selection.hidden-engines"));
    const order = this.list("nyx.selection.order");
    const rank = id => (order.includes(id) ? order.indexOf(id) : order.length);
    const engines = (await nyxSearchService().getVisibleEngines()).sort((a, b) => rank(a.id) - rank(b.id));
    const rows = await Promise.all(
      engines.map(async engine => {
        const row = document.createXULElement("hbox");
        row.className = "nyx-row nyx-engine-row";
        row.setAttribute("align", "center");
        row.setAttribute("draggable", "true");
        row.dataset.engine = engine.id;
        const grip = document.createXULElement("image");
        grip.className = "nyx-grip";
        const icon = document.createXULElement("image");
        icon.className = "nyx-engine-icon";
        icon.setAttribute("src", (await engine.getIconURL(32)) || "chrome://browser/content/nyx/icons/search.svg");
        const text = document.createXULElement("hbox");
        text.className = "nyx-row-text";
        text.setAttribute("flex", "1");
        text.setAttribute("align", "baseline");
        const name = document.createXULElement("label");
        name.setAttribute("value", engine.name);
        text.append(name);
        if (engine.aliases?.length) {
          const keyword = document.createXULElement("description");
          keyword.className = "nyx-row-note";
          document.l10n.setAttributes(keyword, "nyx-selection-keyword", { keyword: engine.aliases[0] });
          text.append(keyword);
        }
        const toggle = document.createXULElement("checkbox");
        toggle.className = "nyx-switch";
        toggle.checked = !hidden.has(engine.id);
        toggle.setAttribute("aria-label", engine.name);
        toggle.addEventListener("command", () => {
          const now = new Set(this.list("nyx.selection.hidden-engines"));
          toggle.checked ? now.delete(engine.id) : now.add(engine.id);
          Services.prefs.setStringPref("nyx.selection.hidden-engines", [...now].join(","));
        });
        row.append(grip, icon, text, toggle);
        return row;
      })
    );
    box.querySelectorAll(".nyx-engine-row").forEach(row => row.remove());
    foot.before(...rows);
    let dragged = null;
    for (const row of rows) {
      row.addEventListener("dragstart", event => {
        dragged = row;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", row.dataset.engine);
      });
      row.addEventListener("dragover", event => {
        if (dragged && dragged !== row) {
          event.preventDefault();
          const after = event.clientY > row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2;
          (after ? row.nextSibling : row) !== dragged && box.insertBefore(dragged, after ? row.nextSibling : row);
        }
      });
      row.addEventListener("dragend", () => {
        dragged = null;
        Services.prefs.setStringPref("nyx.selection.order", [...box.querySelectorAll(".nyx-engine-row")].map(r => r.dataset.engine).join(","));
      });
    }
  },
};

var gNyxDownloadsPane = {
  get video() {
    return ChromeUtils.importESModule("chrome://browser/content/nyx/NyxVideo.sys.mjs").NyxVideo;
  },

  init() {
    const showVideos = async () => {
      document.getElementById("nyxVideoFolder").textContent = nyxHome(await this.video.folder());
    };
    const examples = {
      "title-channel": "Ridge loop in 4K [Trail Days].mp4",
      title: "Ridge loop in 4K.mp4",
      "channel-title": "Trail Days - Ridge loop in 4K.mp4",
      "date-title": "2026-11-10 Ridge loop in 4K.mp4",
    };
    const showNames = () => {
      document.getElementById("nyxVideoNamesExample").textContent = examples[Services.prefs.getStringPref("nyx.video.names", "title-channel")] ?? "";
    };
    document.getElementById("nyxDownloadsFiles").addEventListener("command", () => {
      window.browsingContext.topChromeWindow?.BrowserCommands.downloadsUI();
    });
    document.getElementById("nyxVideoFolderChange").addEventListener("command", async () => {
      nyxChooseFolder("nyx-video-folder-title", await this.video.folder(), path => {
        Services.prefs.setStringPref("nyx.video.folder", path);
        showVideos();
      });
    });
    Services.prefs.addObserver("nyx.video.names", showNames);
    window.addEventListener("unload", () => Services.prefs.removeObserver("nyx.video.names", showNames), { once: true });
    showVideos();
    showNames();
    this.video.version().then(
      ({ version, path }) => document.l10n.setAttributes(document.getElementById("nyxVideoVersion"), "nyx-video-version", { version, path: path ?? "" }),
      () => document.l10n.setAttributes(document.getElementById("nyxVideoVersion"), "nyx-video-missing")
    );
  },
};
var gNyxPasswordsPane = {
  get passwords() {
    return ChromeUtils.importESModule("chrome://browser/content/nyx/NyxPasswords.sys.mjs").NyxPasswords;
  },

  init() {
    document.getElementById("nyxPasswordsOpen").addEventListener("command", () => {
      window.browsingContext.topChromeWindow?.NyxPasswordsUI?.openPopup();
    });
    document.getElementById("nyxPasswordsLock").addEventListener("command", async () => {
      await this.passwords.lock();
      this.showStatus();
    });
    document.getElementById("nyxPasswordsImport").addEventListener("command", () => this.import());
    this.showStatus();
    this.showFirefox();
  },

  async showStatus() {
    const note = document.getElementById("nyxPasswordsStatus");
    let state = "unavailable";
    if (await this.passwords.paired()) {
      state = (await this.passwords.status()).state ?? "unavailable";
    } else {
      state = "unpaired";
    }
    document.l10n.setAttributes(note, `nyx-passwords-state-${["unlocked", "locked", "unpaired"].includes(state) ? state : "unavailable"}`);
    document.getElementById("nyxPasswordsLock").hidden = state !== "unlocked";
  },

  async showFirefox() {
    const count = (await Services.logins.getAllLogins()).length;
    document.l10n.setAttributes(document.getElementById("nyxPasswordsFirefoxCount"), "nyx-passwords-firefox-count", { count });
    document.getElementById("nyxPasswordsImport").disabled = count === 0;
  },

  async import() {
    const button = document.getElementById("nyxPasswordsImport");
    button.disabled = true;
    const { moved, left } = await this.passwords.importFirefoxLogins();
    document.l10n.setAttributes(document.getElementById("nyxPasswordsFirefoxCount"), "nyx-passwords-imported", { moved, left });
    button.disabled = left === 0;
  },
};
var gNyxBlockingPane = {
  UBO: "uBlock0@raymondhill.net",

  async init() {
    // Dialog and action listeners before any await: register_module does not await init.
    this.initCookies();
    this.initSecurity();
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const on = document.getElementById("nyxBlockingOn");
    const show = addon => {
      on.checked = !!addon?.isActive;
      on.disabled = !addon;
      const note = document.getElementById("nyxBlockingVersion");
      if (addon) {
        document.l10n.setAttributes(note, "nyx-blocking-version", { version: addon.version });
      } else {
        document.l10n.setAttributes(note, "nyx-blocking-missing");
      }
    };
    // uBlock's dashboard keeps its lists, filters and trusted sites.
    const dashboard = page => () => {
      const policy = WebExtensionPolicy.getByID(this.UBO);
      if (policy) {
        window.browsingContext.topChromeWindow?.openTrustedLinkIn(policy.getURL(`dashboard.html#${page}`), "tab");
      }
    };
    document.getElementById("nyxBlockingLists").addEventListener("command", dashboard("3p-filters.html"));
    document.getElementById("nyxBlockingTrusted").addEventListener("command", dashboard("whitelist.html"));
    // Firefox's cookie banner handling: 1 refuses where it can, 0 is off.
    const banners = document.getElementById("nyxCookieBanners");
    banners.checked = Services.prefs.getIntPref("cookiebanners.service.mode", 0) !== 0;
    banners.addEventListener("command", () => {
      const mode = banners.checked ? 1 : 0;
      Services.prefs.setIntPref("cookiebanners.service.mode", mode);
      Services.prefs.setIntPref("cookiebanners.service.mode.privateBrowsing", mode);
    });
    on.addEventListener("command", async () => {
      const addon = await AddonManager.getAddonByID(this.UBO);
      await (on.checked ? addon?.enable() : addon?.disable());
      show(await AddonManager.getAddonByID(this.UBO));
    });
    show(await AddonManager.getAddonByID(this.UBO));
  },

  initCookies() {
    // Deleting cookies when Browser closes: Firefox's sanitize-on-shutdown, cookies and site data only.
    nyxSwitch(
      "nyxClearOnClose",
      () => nyxBool("privacy.sanitize.sanitizeOnShutdown") && nyxBool("privacy.clearOnShutdown_v2.cookiesAndStorage"),
      on => {
        Services.prefs.setBoolPref("privacy.sanitize.sanitizeOnShutdown", on);
        Services.prefs.setBoolPref("privacy.clearOnShutdown_v2.cookiesAndStorage", on);
      },
      ["privacy.sanitize.sanitizeOnShutdown", "privacy.clearOnShutdown_v2.cookiesAndStorage"]
    );
    document.getElementById("nyxCookieExceptions").addEventListener("command", () =>
      nyxDialog("chrome://browser/content/preferences/dialogs/permissions.xhtml", {
        blockVisible: true,
        sessionVisible: true,
        allowVisible: true,
        prefilledHost: "",
        permissionType: "cookie",
      })
    );
    const showData = async () => {
      await SiteDataManager.updateSites();
      const sites = await SiteDataManager.getSites();
      const bytes = sites.reduce((sum, site) => sum + (site.usage || 0), 0);
      const [amount, unit] = DownloadUtils.convertByteUnits(bytes);
      document.l10n.setAttributes(document.getElementById("nyxSiteDataNote"), "nyx-privacy-stored-note", { amount, unit, sites: sites.length });
    };
    document.getElementById("nyxSiteData").addEventListener("command", () =>
      nyxDialog("chrome://browser/content/preferences/dialogs/siteDataSettings.xhtml", undefined, showData)
    );
    showData();
    document.getElementById("nyxClearHistory").addEventListener("command", () => {
      const { Sanitizer } = ChromeUtils.importESModule("resource:///modules/Sanitizer.sys.mjs");
      gSubDialog.open(
        "chrome://browser/content/sanitize_v2.xhtml",
        { features: "resizable=no", closingCallback: () => Services.obs.notifyObservers(null, "clear-private-data") },
        { entryPoint: Sanitizer.DIALOG_ENTRY_POINTS.SETTINGS_HISTORY }
      );
    });
  },

  initSecurity() {
    nyxSwitch(
      "nyxStrict",
      () => Services.prefs.getStringPref("browser.contentblocking.category", "standard") === "strict",
      on => Services.prefs.setStringPref("browser.contentblocking.category", on ? "strict" : "standard"),
      ["browser.contentblocking.category"]
    );
    nyxChoice(
      "nyxHttpsOnly",
      {
        all: { "dom.security.https_only_mode": true, "dom.security.https_only_mode_pbm": true },
        private: { "dom.security.https_only_mode": false, "dom.security.https_only_mode_pbm": true },
        off: { "dom.security.https_only_mode": false, "dom.security.https_only_mode_pbm": false },
      },
      () => {
        if (nyxBool("dom.security.https_only_mode")) {
          return "all";
        }
        return nyxBool("dom.security.https_only_mode_pbm") ? "private" : "off";
      }
    );
    const safe = ["browser.safebrowsing.malware.enabled", "browser.safebrowsing.phishing.enabled", "browser.safebrowsing.downloads.enabled"];
    nyxSwitch(
      "nyxSafeBrowsing",
      () => safe.every(nyxBool),
      on => safe.forEach(pref => Services.prefs.setBoolPref(pref, on)),
      safe
    );
    document.getElementById("nyxCertificates").addEventListener("command", () => nyxDialog("chrome://pippki/content/certManager.xhtml"));
  },
};
var gNyxVpnPane = {
  get vpn() {
    return ChromeUtils.importESModule("chrome://browser/content/nyx/NyxVpn.sys.mjs").NyxVpn;
  },

  init() {
    nyxChips({ pref: "nyx.vpn.bypass", box: "nyxVpnBypass", add: "nyxVpnBypassAdd", note: "nyxVpnBypassNone", ask: nyxSiteAsk, normalize: value => (value.trim().startsWith("*.") ? `*.${nyxHost(value.trim().slice(2))}` : nyxHost(value)) });
    const form = document.getElementById("nyxVpnAddGroup");
    document.getElementById("nyxVpnAdd").addEventListener("command", () => {
      form.dataset.open = "true";
      this.showForm();
    });
    document.getElementById("nyxVpnAddCancel").addEventListener("command", () => this.closeForm());
    document.getElementById("nyxVpnAddSave").addEventListener("command", () => this.add());
    document.getElementById("nyxVpnProvider").addEventListener("command", () => this.showForm());
    this.closeForm();
    this.showForm();
    const stop = this.vpn.onChange(() => this.show());
    window.addEventListener("unload", stop, { once: true });
    this.show();
  },

  // The form is its own card, shown only while adding (data-open; Settings shows every card of a
  // pane as it opens it, so hidden alone wouldn't keep it closed).
  closeForm() {
    const form = document.getElementById("nyxVpnAddGroup");
    delete form.dataset.open;
    for (const id of ["nyxVpnHost", "nyxVpnPort", "nyxVpnUser", "nyxVpnPassword"]) {
      document.getElementById(id).value = "";
    }
    document.getElementById("nyxVpnError").textContent = "";
  },

  showForm() {
    const provider = document.getElementById("nyxVpnProvider").value;
    document.getElementById("nyxVpnAddGroup").setAttribute("nyx-provider", provider);
    document.l10n.setAttributes(document.getElementById("nyxVpnHelp"), `nyx-vpn-help-${provider}`);
    document.l10n.setAttributes(document.getElementById("nyxVpnUserLabel"), provider === "proxy" ? "nyx-vpn-username-optional" : "nyx-vpn-service-username");
  },

  async add() {
    const value = id => document.getElementById(id).value.trim();
    const provider = document.getElementById("nyxVpnProvider").value;
    const error = document.getElementById("nyxVpnError");
    error.textContent = "";
    if (provider !== "proxy" && (!value("nyxVpnUser") || !document.getElementById("nyxVpnPassword").value)) {
      document.l10n.setAttributes(error, "nyx-vpn-need-login");
      return;
    }
    const details = { provider, username: value("nyxVpnUser"), password: document.getElementById("nyxVpnPassword").value };
    if (provider === "proxy") {
      Object.assign(details, { type: document.getElementById("nyxVpnType").value, host: value("nyxVpnHost"), port: value("nyxVpnPort"), name: value("nyxVpnHost") });
    }
    document.getElementById("nyxVpnAddSave").disabled = true;
    try {
      await this.vpn.add(details);
      this.closeForm();
    } catch (e) {
      error.textContent = e.message;
    } finally {
      document.getElementById("nyxVpnAddSave").disabled = false;
    }
  },

  async show() {
    const state = await this.vpn.state();
    const box = document.getElementById("nyxVpnConnections");
    const addRow = document.getElementById("nyxVpnAddRow");
    box.querySelectorAll(".nyx-vpn-connection").forEach(row => row.remove());
    for (const c of state.connections) {
      const row = document.createXULElement("hbox");
      row.className = "nyx-row nyx-vpn-connection";
      row.setAttribute("align", "center");
      const text = document.createXULElement("vbox");
      text.className = "nyx-row-text";
      text.setAttribute("flex", "1");
      const name = document.createXULElement("label");
      name.setAttribute("value", c.name);
      const sub = document.createXULElement("description");
      sub.className = "nyx-row-note";
      const kind = { https: "HTTPS proxy", http: "HTTP proxy", socks: "SOCKS5 proxy" }[c.type];
      const where = [c.location?.name, c.location?.city].filter(Boolean).join(", ");
      sub.textContent = [state.active === c.id ? "●" : "", `${c.host}:${c.port}`, kind, where].filter(Boolean).join(" · ");
      text.append(name, sub);
      const toggle = document.createXULElement("button");
      document.l10n.setAttributes(toggle, state.active === c.id ? "nyx-vpn-disconnect" : "nyx-vpn-connect");
      toggle.addEventListener("command", () => this.vpn.setActive(state.active === c.id ? null : c.id));
      const remove = document.createXULElement("button");
      document.l10n.setAttributes(remove, "nyx-vpn-remove");
      remove.addEventListener("command", () => this.vpn.remove(c.id));
      row.append(text, toggle, remove);
      addRow.before(row);
    }
    // Each workspace: the switch's VPN, none, or one of its own.
    const spaces = document.getElementById("nyxVpnWorkspaces");
    spaces.querySelectorAll(".nyx-row").forEach(row => row.remove());
    const workspaces = window.browsingContext.topChromeWindow?.gZenWorkspaces?.getWorkspaces() ?? [];
    for (const workspace of workspaces) {
      const row = document.createXULElement("hbox");
      row.className = "nyx-row";
      row.setAttribute("align", "center");
      const name = document.createXULElement("label");
      name.className = "nyx-row-text";
      name.setAttribute("flex", "1");
      name.setAttribute("value", `${workspace.icon && !workspace.icon.endsWith(".svg") ? `${workspace.icon}  ` : ""}${workspace.name}`);
      const list = document.createXULElement("menulist");
      const popup = document.createXULElement("menupopup");
      const item = (value, l10nId, label) => {
        const node = document.createXULElement("menuitem");
        node.setAttribute("value", value);
        if (l10nId) {
          document.l10n.setAttributes(node, l10nId);
        } else {
          node.setAttribute("label", label);
        }
        popup.append(node);
      };
      item("default", "nyx-vpn-workspace-default");
      item("none", "nyx-vpn-workspace-none");
      for (const c of state.connections) {
        item(c.id, null, `${c.name}${c.location?.name ? ` · ${c.location.name}` : ""}`);
      }
      list.append(popup);
      list.value = state.workspaces[workspace.uuid] ?? "default";
      list.addEventListener("command", () => this.vpn.setWorkspace(workspace.uuid, list.value));
      row.append(name, list);
      spaces.append(row);
    }
  },
};

/** Saved sessions: the open tabs of the window Settings is in, under a name, in the profile. */
var gNyxSessions = {
  get file() {
    return PathUtils.join(PathUtils.profileDir, "nyx-sessions.json");
  },

  async read() {
    try {
      const { sessions } = await IOUtils.readJSON(this.file);
      return Array.isArray(sessions) ? sessions : [];
    } catch {
      return [];
    }
  },

  async write(sessions) {
    await IOUtils.writeJSON(this.file, { sessions }, { tmpPath: `${this.file}.tmp` });
    this.refresh();
  },

  init() {
    document.getElementById("nyxSessionSave").addEventListener("command", () => this.save());
    document.getElementById("nyxSessionMenu").addEventListener("popupshowing", () => this.fill());
    this.refresh();
  },

  async refresh() {
    const sessions = await this.read();
    const note = document.getElementById("nyxSessionsNote");
    if (sessions.length) {
      document.l10n.setAttributes(note, "nyx-tabs-sessions-saved", { count: sessions.length });
    } else {
      document.l10n.setAttributes(note, "nyx-tabs-sessions-description");
    }
  },

  async save() {
    const win = window.browsingContext.topChromeWindow;
    const tabs = win.gBrowser.tabs
      .filter(tab => !tab.closing && !tab.hasAttribute("zen-empty-tab"))
      .map(tab => ({ url: tab.linkedBrowser.currentURI.spec, title: tab.label }))
      .filter(({ url }) => /^(https?|file):/.test(url));
    if (!tabs.length) {
      return;
    }
    const [title, prompt] = await document.l10n.formatValues([
      { id: "nyx-tabs-sessions-name-title" },
      { id: "nyx-tabs-sessions-name-prompt" },
    ]);
    const name = { value: new Date().toLocaleString() };
    if (!Services.prompt.prompt(window, title, prompt, name, null, {}) || !name.value.trim()) {
      return;
    }
    const sessions = await this.read();
    sessions.unshift({ name: name.value.trim(), saved: Date.now(), tabs });
    await this.write(sessions);
  },

  async fill() {
    const menu = document.getElementById("nyxSessionMenu");
    const sessions = await this.read();
    menu.replaceChildren();
    if (!sessions.length) {
      const empty = document.createXULElement("menuitem");
      empty.disabled = true;
      document.l10n.setAttributes(empty, "nyx-tabs-sessions-empty");
      menu.append(empty);
      return;
    }
    sessions.forEach((session, index) => {
      const sub = document.createXULElement("menu");
      sub.setAttribute("label", session.name);
      const popup = document.createXULElement("menupopup");
      const open = document.createXULElement("menuitem");
      document.l10n.setAttributes(open, "nyx-tabs-sessions-open", { count: session.tabs.length });
      open.addEventListener("command", () => {
        const win = window.browsingContext.topChromeWindow;
        for (const { url } of session.tabs) {
          win.openTrustedLinkIn(url, "tab", { inBackground: true });
        }
      });
      const remove = document.createXULElement("menuitem");
      document.l10n.setAttributes(remove, "nyx-tabs-sessions-delete");
      remove.addEventListener("command", async () => {
        const all = await this.read();
        all.splice(index, 1);
        await this.write(all);
      });
      popup.append(open, remove);
      sub.append(popup);
      menu.append(sub);
    });
  },
};

/** Settings › General › Nyx apps: what the native host lets the Nyx apps do in Browser. */
var gNyxApps = {
  GROUPS: [
    ["nyxIntegrationShare", "share"],
    ["nyxIntegrationCapture", "capture"],
    ["nyxIntegrationAssistant", "assistant"],
  ],

  async init() {
    const { ok, value } = await gNyxFiles.read("integrations.json");
    document.getElementById("nyxIntegrationsUnreadable").hidden = ok;
    for (const [id, key] of this.GROUPS) {
      const box = document.getElementById(id);
      // As the host reads it: a group not listed is on, a listed one only if it's true, and a
      // file that can't be read turns everything off.
      box.checked = ok && (!(key in value) || value[key] === true);
      box.addEventListener("command", () => this.save());
    }
  },

  async save() {
    const { value } = await gNyxFiles.read("integrations.json");
    for (const [id, key] of this.GROUPS) {
      value[key] = document.getElementById(id).checked;
    }
    await gNyxFiles.write("integrations.json", value);
    document.getElementById("nyxIntegrationsUnreadable").hidden = true;
  },
};

/* The navigation as the mockups have Settings: no heading, Find at the top, each section's icon on
 * a faint tile of its colour. The nav and its buttons draw in their own shadow roots, so their
 * looks go in there. */
{
  const STYLES = {
    // Toolkit's :host { height: 100vh } is taller than the Settings tab and clips About.
    "moz-page-nav": `:host {
        height: 100% !important;
        max-height: 100% !important;
        min-height: 0 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
      }
      .page-nav-heading-wrapper, hr, #secondary-nav-group { display: none; }
      nav {
        flex: 1 1 0 !important;
        min-height: 0 !important;
        margin-top: 0;
        padding-bottom: 16px;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        scrollbar-width: none !important;
      }
      nav::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }`,
    "moz-page-nav-button": `.page-nav-icon { box-sizing: border-box; width: 22px; height: 22px; padding: 4px; border-radius: 6px;
        background: color-mix(in srgb, var(--nyx-nav-tile, #6b6f7e) 20%, transparent);
        fill: var(--nyx-nav-tile, #6b6f7e); -moz-context-properties: fill, fill-opacity; }
      button { min-height: 34px; padding-inline: 8px; border-radius: 8px; gap: 10px; font-size: 13px; color: var(--nyx-text); }
      button[selected] { color: var(--nyx-text); background-color: var(--nyx-nav-active, color-mix(in srgb, var(--nyx-text) 8%, transparent)); font-weight: 500; }
      button::before, button[selected]::before { display: none; }`,
  };
  const dress = async element => {
    await element.updateComplete;
    const root = element.shadowRoot;
    if (!root || !STYLES[element.localName]) {
      return;
    }
    let style = root.querySelector(".nyx-nav-style");
    if (!style) {
      style = document.createElement("style");
      style.className = "nyx-nav-style";
      root.append(style);
    }
    style.textContent = STYLES[element.localName];
    // Wheel over slotted category buttons doesn't always scroll the shadow <nav>; forward it.
    if (element.localName === "moz-page-nav" && !element._nyxWheelScroll) {
      element._nyxWheelScroll = true;
      element.addEventListener(
        "wheel",
        event => {
          const nav = root.querySelector("nav");
          if (!nav || nav.scrollHeight <= nav.clientHeight + 1) {
            return;
          }
          const top = nav.scrollTop;
          const max = nav.scrollHeight - nav.clientHeight;
          const next = Math.max(0, Math.min(max, top + event.deltaY));
          if (next === top) {
            return;
          }
          nav.scrollTop = next;
          event.preventDefault();
          event.stopPropagation();
        },
        { passive: false }
      );
    }
  };
  const dressAll = () => document.querySelectorAll("moz-page-nav, moz-page-nav-button").forEach(dress);
  const start = () => {
    dressAll();
    const categories = document.getElementById("categories");
    if (categories) {
      new MutationObserver(() => dressAll()).observe(categories, { childList: true });
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

const nyxTopWindow = () => window.browsingContext.topChromeWindow;

var gNyxGeneralPane = {
  init() {
    this.initDefault();
    this.initFiles();
    this.initLanguage();
    gNyxSessions.init();
    gNyxApps.init();
    document.getElementById("nyxConnection").addEventListener("command", () => nyxDialog("chrome://browser/content/preferences/dialogs/connection.xhtml"));
  },

  initDefault() {
    const show = () => {
      const isDefault = DefaultBrowserHelper.canCheck && DefaultBrowserHelper.isBrowserDefault;
      document.getElementById("nyxDefaultYes").hidden = !isDefault;
      document.getElementById("nyxDefaultMake").hidden = isDefault || !DefaultBrowserHelper.canCheck;
    };
    document.getElementById("nyxDefaultMake").addEventListener("command", async () => {
      await DefaultBrowserHelper.setDefaultBrowser();
      show();
    });
    show();
  },

  initFiles() {
    const { Downloads } = ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs");
    const show = async () => {
      document.getElementById("nyxDownloadsFolder").textContent = nyxHome(await Downloads.getPreferredDownloadsDirectory());
    };
    document.getElementById("nyxDownloadsFolderChange").addEventListener("command", async () => {
      nyxChooseFolder("nyx-downloads-folder-title", await Downloads.getPreferredDownloadsDirectory(), path => {
        Services.prefs.setStringPref("browser.download.dir", path);
        Services.prefs.setIntPref("browser.download.folderList", 2);
        show();
      });
    });
    show();
  },

  initLanguage() {
    // The languages Browser has, each in its own name; choosing one asks Browser to restart into it.
    const list = document.getElementById("nyxLocale");
    const popup = document.getElementById("nyxLocalePopup");
    const codes = Services.locale.availableLocales;
    const names = Services.intl.getLocaleDisplayNames(undefined, codes, { preferNative: true });
    popup.replaceChildren(
      ...codes.map((code, i) => {
        const item = document.createXULElement("menuitem");
        item.setAttribute("value", code);
        item.setAttribute("label", names[i]);
        return item;
      })
    );
    list.value = Services.locale.appLocaleAsBCP47;
    list.disabled = codes.length < 2;
    list.addEventListener("command", () => {
      Services.locale.requestedLocales = [list.value];
      Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
    });
    document.getElementById("nyxWebLanguages").addEventListener("command", () =>
      nyxDialog("chrome://browser/content/preferences/dialogs/languages.xhtml")
    );
    nyxSwitch(
      "nyxSpellcheck",
      () => Services.prefs.getIntPref("layout.spellcheckDefault", 1) !== 0,
      on => Services.prefs.setIntPref("layout.spellcheckDefault", on ? 1 : 0),
      ["layout.spellcheckDefault"]
    );
  },
};

var gNyxStartPane = {
  init() {
    const menu = document.getElementById("nyxHomepage");
    const row = document.getElementById("nyxHomepageCustomRow");
    const field = document.getElementById("nyxHomepageCustom");
    const kind = () => {
      const page = HomePage.get();
      // Browser's start page is its extension's (home.js), which HomePage answers for the default.
      if (HomePage.isDefault || page === "about:home" || page === "about:newtab" || page.startsWith("moz-extension:")) {
        return "start";
      }
      return page === "about:blank" ? "blank" : "custom";
    };
    const show = () => {
      menu.value = kind();
      row.hidden = menu.value !== "custom";
      if (menu.value === "custom" && document.activeElement !== field) {
        field.value = HomePage.get();
      }
    };
    menu.addEventListener("command", () => {
      if (menu.value === "start") {
        HomePage.reset();
      } else if (menu.value === "blank") {
        HomePage.set("about:blank");
      } else {
        row.hidden = false;
        field.focus();
      }
    });
    field.addEventListener("change", () => {
      const url = field.value.trim();
      if (url) {
        HomePage.set(url);
      }
    });
    Services.prefs.addObserver("browser.startup.homepage", show);
    window.addEventListener("unload", () => Services.prefs.removeObserver("browser.startup.homepage", show), { once: true });
    show();
    document.getElementById("nyxStartOpen").addEventListener("command", () => nyxTopWindow()?.BrowserCommands.openTab());
  },
};

var gNyxSearchPane = {
  async init() {
    const places = ["browser.urlbar.suggest.history", "browser.urlbar.suggest.bookmark", "browser.urlbar.suggest.openpage"];
    nyxSwitch(
      "nyxSuggestPlaces",
      () => places.some(nyxBool),
      on => places.forEach(pref => Services.prefs.setBoolPref(pref, on)),
      places
    );
    for (const [id, isPrivate] of [["nyxEngine", false], ["nyxPrivateEngine", true]]) {
      document.getElementById(id).addEventListener("command", async event => {
        const service = nyxSearchService();
        const engine = service.getEngineByName(event.target.value ?? document.getElementById(id).value);
        if (!engine) {
          return;
        }
        if (isPrivate) {
          Services.prefs.setBoolPref("browser.search.separatePrivateDefault", true);
          await service.setDefaultPrivate(engine, service.CHANGE_REASON.USER);
        } else {
          await service.setDefault(engine, service.CHANGE_REASON.USER);
        }
      });
    }
    document.getElementById("nyxEngineAdd").addEventListener("command", () =>
      nyxDialog("chrome://browser/content/search/addEngine.xhtml", { mode: "NEW" })
    );
    document.getElementById("nyxEngineRestore").addEventListener("command", () => nyxSearchService().restoreDefaultEngines());
    Services.obs.addObserver(this, "browser-search-engine-modified");
    window.addEventListener("unload", () => Services.obs.removeObserver(this, "browser-search-engine-modified"), { once: true });
    await this.show();
  },

  observe() {
    this.show();
  },

  async show() {
    const service = nyxSearchService();
    const engines = await service.getVisibleEngines();
    const fill = (id, current) => {
      const list = document.getElementById(id);
      const popup = list.menupopup;
      popup.replaceChildren(
        ...engines.map(engine => {
          const item = document.createXULElement("menuitem");
          item.setAttribute("value", engine.name);
          item.setAttribute("label", engine.name);
          return item;
        })
      );
      list.value = current?.name ?? "";
    };
    fill("nyxEngine", await service.getDefault());
    fill("nyxPrivateEngine", await service.getDefaultPrivate());

    // Every engine with its keyword: click the keyword to change it; engines you added can go.
    const box = document.getElementById("nyxEngineList");
    const rows = await Promise.all(
      engines.map(async engine => {
        const row = document.createXULElement("hbox");
        row.className = "nyx-list-row";
        row.setAttribute("align", "center");
        const icon = document.createXULElement("image");
        icon.className = "nyx-engine-icon";
        icon.setAttribute("src", (await engine.getIconURL(32)) || "chrome://browser/content/nyx/icons/search.svg");
        const text = document.createXULElement("vbox");
        text.className = "nyx-row-text";
        text.setAttribute("flex", "1");
        const name = document.createXULElement("label");
        name.setAttribute("value", engine.name);
        const note = document.createXULElement("description");
        note.className = "nyx-row-note";
        const alias = engine.aliases?.[0] ?? "";
        document.l10n.setAttributes(note, alias ? "nyx-search-keyword-note" : "nyx-search-no-keyword", { keyword: alias });
        text.append(name, note);
        const keyword = document.createXULElement("button");
        keyword.className = "nyx-keyword";
        if (alias) {
          keyword.setAttribute("label", alias);
        } else {
          document.l10n.setAttributes(keyword, "nyx-search-set-keyword");
        }
        keyword.addEventListener("command", () => this.editKeyword(engine));
        row.append(icon, text, keyword);
        if (engine.isUserEngine || !engine.isAppProvided) {
          const remove = document.createXULElement("button");
          remove.className = "nyx-chip-remove";
          document.l10n.setAttributes(remove, "nyx-chip-remove", { name: engine.name });
          remove.addEventListener("command", () => service.removeEngine(engine, service.CHANGE_REASON.USER));
          row.append(remove);
        }
        return row;
      })
    );
    box.replaceChildren(...rows);
  },

  async editKeyword(engine) {
    const [title, prompt] = await document.l10n.formatValues([{ id: "nyx-search-keyword-title" }, { id: "nyx-search-keyword-prompt", args: { engine: engine.name } }]);
    const value = { value: engine.aliases?.[0] ?? "" };
    if (!Services.prompt.prompt(window, title, prompt, value, null, {})) {
      return;
    }
    const keyword = value.value.trim().toLowerCase();
    const taken = keyword && (await nyxSearchService().getEngineByAlias(keyword));
    if (taken && taken.name !== engine.name) {
      const [message] = await document.l10n.formatValues([{ id: "nyx-search-keyword-taken", args: { keyword, engine: taken.name } }]);
      Services.prompt.alert(window, title, message);
      return;
    }
    engine.alias = keyword;
    this.show();
  },
};

var gNyxPermissionsPane = {
  init() {
    for (const button of document.querySelectorAll(".nyx-perm-manage")) {
      const { permission, dialog } = button.dataset;
      button.addEventListener("command", () => {
        if (dialog === "permission") {
          nyxDialog("chrome://browser/content/preferences/dialogs/permissions.xhtml", {
            blockVisible: false,
            sessionVisible: false,
            allowVisible: true,
            prefilledHost: "",
            permissionType: permission,
          });
        } else {
          nyxDialog("chrome://browser/content/preferences/dialogs/sitePermissions.xhtml", { permissionType: permission }, () => this.count());
        }
      });
    }
    this.count();
  },

  /** How many sites each permission has a decision for. */
  count() {
    const counts = new Map();
    for (const permission of Services.perms.all) {
      counts.set(permission.type, (counts.get(permission.type) ?? 0) + 1);
    }
    for (const note of document.querySelectorAll("[id^='nyxPerm-']")) {
      const type = note.id.slice("nyxPerm-".length);
      document.l10n.setAttributes(note, "nyx-permissions-sites", { count: counts.get(type) ?? 0 });
    }
  },
};

var gNyxGesturesPane = {
  init() {
    nyxSwitch(
      "nyxSwipe",
      () => !nyxBool("widget.disable-swipe-tracker"),
      on => Services.prefs.setBoolPref("widget.disable-swipe-tracker", !on),
      ["widget.disable-swipe-tracker"]
    );
    // Ctrl and the wheel: 3 zooms, 1 scrolls.
    nyxSwitch(
      "nyxCtrlWheel",
      () => Services.prefs.getIntPref("mousewheel.with_control.action", 3) === 3,
      on => Services.prefs.setIntPref("mousewheel.with_control.action", on ? 3 : 1),
      ["mousewheel.with_control.action"]
    );
    document.getElementById("nyxShortcuts").addEventListener("command", () => gotoPref("paneNyxGestures-keys"));
    document.getElementById("nyxKeysBack").addEventListener("command", () => gotoPref("paneNyxGestures"));
    document.getElementById("nyxKeysResetAll").addEventListener("command", () => this.keys.resetAll());
    document.getElementById("nyxKeysFind").addEventListener("input", event => this.keys.find(event.target.value));
    // Back to Gestures itself (its button in the side, Back): its own groups again.
    document.addEventListener("paneshown", event => {
      if (event.detail.category === "paneNyxGestures" && !event.detail.subcategory) {
        this.handleSubcategory(null);
      }
    });
  },

  /** Gestures › Keyboard shortcuts is this pane's `keys` view. */
  handleSubcategory(subcategory) {
    const keys = subcategory === "keys";
    document.documentElement.toggleAttribute("nyx-keys", keys);
    if (keys) {
      this.keys.show();
    }
    return keys;
  },

  // Every shortcut Browser has, from the same place Firefox's keyboard page reads them
  // (CustomKeysParent, which Browser's patch gives Zen's too), changed with CustomKeys.
  keys: {
    actor() {
      if (!this._actor) {
        const { CustomKeysParent } = ChromeUtils.importESModule("moz-src:///browser/components/customkeys/CustomKeysParent.sys.mjs");
        this._actor = Object.create(CustomKeysParent.prototype, {
          browsingContext: { value: window.browsingContext },
          // A captured key comes here, as it would to Firefox's page.
          sendAsyncMessage: { value: (name, data) => this.captured(data) },
        });
      }
      return this._actor;
    },

    ask(name, data) {
      return this.actor().receiveMessage({ name, data });
    },

    async show() {
      const strings = new Localization(["browser/customkeys.ftl", "branding/brand.ftl"]);
      const text = async id => (id.startsWith("customkeys-") ? await strings.formatValue(id) : id);
      const groups = await this.ask("CustomKeys:GetKeys");
      const box = document.getElementById("nyxKeysGroups");
      box.replaceChildren();
      this.rows = new Map();
      for (const [category, keys] of Object.entries(groups)) {
        const card = document.createXULElement("groupbox");
        card.className = "nyx-card nyx-keys-card";
        const title = document.createXULElement("label");
        title.className = "nyx-card-title";
        const h2 = document.createElementNS("http://www.w3.org/1999/xhtml", "h2");
        h2.textContent = await text(category);
        title.append(h2);
        card.append(title);
        for (const [id, data] of Object.entries(keys)) {
          card.append(this.row(id, await text(data.title), data));
        }
        box.append(card);
      }
      this.find(document.getElementById("nyxKeysFind").value);
    },

    row(id, label, data) {
      const row = document.createXULElement("hbox");
      row.className = "nyx-row nyx-key-row";
      row.setAttribute("align", "center");
      row.dataset.id = id;
      row.dataset.label = label;
      const name = document.createXULElement("label");
      name.className = "nyx-row-text";
      name.setAttribute("flex", "1");
      name.setAttribute("value", label);
      const keys = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
      keys.className = "nyx-kbd";
      const change = document.createXULElement("button");
      document.l10n.setAttributes(change, "nyx-keys-change");
      change.addEventListener("command", () => this.record(row));
      const reset = document.createXULElement("button");
      reset.className = "nyx-keys-reset";
      document.l10n.setAttributes(reset, "nyx-keys-reset");
      reset.addEventListener("command", async () => this.update(row, await this.ask("CustomKeys:ResetKey", id)));
      const clear = document.createXULElement("button");
      clear.className = "nyx-keys-clear";
      document.l10n.setAttributes(clear, "nyx-keys-clear");
      clear.addEventListener("command", async () => this.update(row, await this.ask("CustomKeys:ClearKey", id)));
      row.append(name, keys, change, clear, reset);
      this.rows.set(id, row);
      this.update(row, data);
      return row;
    },

    /** Shows a row's keys, each part on its own, and whether it's Browser's own or changed. */
    update(row, data) {
      const keys = row.querySelector(".nyx-kbd");
      keys.replaceChildren();
      if (data.shortcut) {
        for (const part of data.shortcut.split("+").filter(Boolean)) {
          const kbd = document.createElementNS("http://www.w3.org/1999/xhtml", "kbd");
          kbd.textContent = part;
          keys.append(kbd);
        }
      } else {
        document.l10n.setAttributes(keys, "nyx-keys-none");
      }
      row.dataset.shortcut = data.shortcut ?? "";
      row.toggleAttribute("nyx-changed", !!data.isCustomized);
      row.querySelector(".nyx-keys-clear").hidden = !data.shortcut;
    },

    /** Waits for new keys on `row`: Browser takes them before its own shortcuts would. */
    record(row) {
      this.stop();
      this.recording = row;
      row.setAttribute("nyx-recording", "true");
      const keys = row.querySelector(".nyx-kbd");
      keys.replaceChildren();
      document.l10n.setAttributes(keys, "nyx-keys-press");
      this.embedder = window.browsingContext.embedderElement;
      this.embedder.addEventListener("keydown", this.actor(), true);
      this.escape = event => event.key === "Escape" && this.stop(true);
      window.addEventListener("keydown", this.escape, true);
      window.addEventListener("mousedown", this.cancel = () => this.stop(true), { once: true, capture: true });
    },

    stop(cancelled = false) {
      if (!this.recording) {
        return;
      }
      const row = this.recording;
      this.recording = null;
      this.embedder?.removeEventListener("keydown", this.actor(), true);
      window.removeEventListener("keydown", this.escape, true);
      window.removeEventListener("mousedown", this.cancel, true);
      row.removeAttribute("nyx-recording");
      if (cancelled) {
        this.update(row, { shortcut: row.dataset.shortcut, isCustomized: row.hasAttribute("nyx-changed") });
      }
    },

    async captured(data) {
      const row = this.recording;
      if (!row) {
        return;
      }
      const keys = row.querySelector(".nyx-kbd");
      if (data.isModifier) {
        keys.removeAttribute("data-l10n-id");
        keys.textContent = data.modifierString;
        return;
      }
      if (data.key === "ESCAPE" || data.keycode === "VK_ESCAPE") {
        this.stop(true);
        return;
      }
      if (!data.isValid) {
        document.l10n.setAttributes(keys, "nyx-keys-invalid");
        return;
      }
      this.stop();
      data.id = row.dataset.id;
      // Another shortcut with these keys gives them up, once that's confirmed.
      const other = [...this.rows.values()].find(r => r !== row && r.dataset.shortcut === data.shortcut);
      if (other) {
        const [title, body] = await document.l10n.formatValues([{ id: "nyx-keys-taken-title" }, { id: "nyx-keys-taken", args: { shortcut: data.shortcut, other: other.dataset.label } }]);
        if (!Services.prompt.confirm(window, title, body)) {
          this.update(row, { shortcut: row.dataset.shortcut, isCustomized: row.hasAttribute("nyx-changed") });
          return;
        }
        this.update(other, await this.ask("CustomKeys:ClearKey", other.dataset.id));
      }
      this.update(row, await this.ask("CustomKeys:ChangeKey", data));
    },

    async resetAll() {
      const [title, body] = await document.l10n.formatValues([{ id: "nyx-keys-reset-all-title" }, { id: "nyx-keys-reset-all-body" }]);
      if (Services.prompt.confirm(window, title, body)) {
        await this.ask("CustomKeys:ResetAll");
        this.show();
      }
    },

    find(query) {
      const q = query.trim().toLowerCase();
      for (const card of document.querySelectorAll("#nyxKeysGroups .nyx-keys-card")) {
        let any = false;
        for (const row of card.querySelectorAll(".nyx-key-row")) {
          const match = !q || row.dataset.label.toLowerCase().includes(q) || row.dataset.shortcut.toLowerCase().includes(q);
          row.hidden = !match;
          any ||= match;
        }
        card.hidden = !any;
      }
    },
  },
};

var gNyxExtensionsPane = {
  async init() {
    const addons = view => nyxTopWindow()?.BrowserAddonUI.openAddonsMgr(view);
    document.getElementById("nyxExtensionsManage").addEventListener("command", () => addons("addons://list/extension"));
    document.getElementById("nyxExtensionsShortcuts").addEventListener("command", () => addons("addons://shortcuts/shortcuts"));
    document.getElementById("nyxExtensionsGet").addEventListener("command", () =>
      nyxTopWindow()?.openTrustedLinkIn(Services.urlFormatter.formatURLPref("extensions.getAddons.link.url"), "tab")
    );
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    this.AddonManager = AddonManager;
    const listener = { onEnabled: () => this.show(), onDisabled: () => this.show(), onInstalled: () => this.show(), onUninstalled: () => this.show() };
    AddonManager.addAddonListener(listener);
    window.addEventListener("unload", () => AddonManager.removeAddonListener(listener), { once: true });
    await this.show();
  },

  /** How many you've added and how many are on; the Extensions page has them. */
  async show() {
    const addons = (await this.AddonManager.getAddonsByTypes(["extension"])).filter(addon => !addon.hidden && !addon.isBuiltin && !addon.isSystem);
    document.l10n.setAttributes(document.getElementById("nyxExtensionsCount"), "nyx-extensions-count", { added: addons.length, on: addons.filter(addon => addon.isActive).length });
  },
};

// About Browser: its version and updates, as Zen's About dialog had them (AppUpdater), and the
// rest of what that dialog had. Its build info names Browser and its engine's version only.
var gNyxAboutPane = {
  init() {
    if (this.started) {
      return;
    }
    this.started = true;
    document.l10n.addResourceIds(["browser/zen-about.ftl"]);
    const { AppConstants } = ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs");
    this.AppConstants = AppConstants;
    const arch = ["x86", "x86-64"].includes(Services.sysinfo.get("arch")) ? (Services.appinfo.is64Bit ? "64-bit" : "32-bit") : Services.sysinfo.get("arch");
    const date = id => `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
    const version = AppConstants.MOZ_APP_VERSION_DISPLAY;
    document.l10n.setAttributes(document.getElementById("nyxAboutVersion"), "nyx-about-version", { version, date: date(Services.appinfo.appBuildID), engine: AppConstants.ZEN_FIREFOX_VERSION ?? Services.appinfo.platformVersion, arch });
    this.buildInfo = [
      `Browser ${version} (${arch})`,
      `Engine ${AppConstants.ZEN_FIREFOX_VERSION ?? Services.appinfo.platformVersion}`,
      `Build ${Services.appinfo.appBuildID}`,
      `${Services.sysinfo.getProperty("name")} ${Services.sysinfo.getProperty("version")}`,
    ].join("\n");
    document.getElementById("nyxAboutBuild").textContent = this.buildInfo.split("\n").slice(0, 3).join(" · ");
    const open = url => nyxTopWindow()?.openTrustedLinkIn(url, "tab");
    let news = "";
    try {
      news = Services.urlFormatter.formatURLPref("app.releaseNotesURL.aboutDialog");
    } catch {}
    document.getElementById("nyxAboutNewsRow").hidden = !news || news === "about:blank";
    document.getElementById("nyxAboutNews").addEventListener("command", () => open(news));
    document.getElementById("nyxAboutCopy").addEventListener("command", event => {
      Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(this.buildInfo);
      document.l10n.setAttributes(event.target, "nyx-about-copied");
      setTimeout(() => document.l10n.setAttributes(event.target, "nyx-about-copy-button"), 1500);
    });
    document.getElementById("nyxAboutCredits").addEventListener("command", () => open("about:credits"));
    document.getElementById("nyxAboutLicences").addEventListener("command", () => open("about:license"));
    document.getElementById("nyxAboutReport").addEventListener("command", () => open("https://github.com/design-nexus/nyx-browser/issues"));
    this.updates();
  },

  /** The update's state in one line and one button. */
  updates() {
    const text = document.getElementById("nyxAboutUpdateText");
    const button = document.getElementById("nyxAboutUpdate");
    if (!this.AppConstants.MOZ_UPDATER) {
      text.hidden = true;
      return;
    }
    const { AppUpdater } = ChromeUtils.importESModule("resource://gre/modules/AppUpdater.sys.mjs");
    const { DownloadUtils } = ChromeUtils.importESModule("resource://gre/modules/DownloadUtils.sys.mjs");
    const updater = new AppUpdater();
    const S = AppUpdater.STATUS;
    let action = null;
    button.addEventListener("command", () => action?.());
    const manual = () => {
      try {
        nyxTopWindow()?.openTrustedLinkIn(Services.urlFormatter.formatURLPref("app.update.url.manual"), "tab");
      } catch {}
    };
    const say = (state, textId, args, buttonId, run) => {
      text.hidden = !textId;
      text.dataset.state = state;
      if (textId) {
        document.l10n.setAttributes(text, textId, args);
      }
      button.hidden = !buttonId;
      action = run ?? null;
      if (buttonId) {
        document.l10n.setAttributes(button, buttonId);
      }
      button.classList.toggle("nyx-primary", ["available", "ready"].includes(state));
    };
    const restart = () => {
      const cancel = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
      Services.obs.notifyObservers(cancel, "quit-application-requested", "restart");
      if (!cancel.data) {
        Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart);
      }
    };
    const listener = (status, ...args) => {
      switch (status) {
        case S.NEVER_CHECKED:
          return say("never", "", null, "nyx-about-check", () => updater.check());
        case S.CHECKING:
          return say("checking", "zen-about-update-checking");
        case S.NO_UPDATES_FOUND:
          return say("ok", "zen-about-update-up-to-date", null, "nyx-about-check", () => updater.check());
        case S.DOWNLOAD_AND_INSTALL:
          return say("available", "zen-about-update-available", { version: updater.update?.displayVersion ?? "" }, "nyx-about-download", () => updater.allowUpdateDownload());
        case S.DOWNLOADING: {
          const [progress = 0, max = updater.update?.selectedPatch?.size ?? -1] = args;
          return say("downloading", "zen-about-update-downloading", { transfer: DownloadUtils.getTransferTotal(progress, max) });
        }
        case S.STAGING:
          return say("downloading", "zen-about-update-applying");
        case S.READY_FOR_RESTART:
          return say("ready", "zen-about-update-ready", null, "nyx-about-restart", restart);
        case S.DOWNLOAD_FAILED:
        case S.INTERNAL_ERROR:
          return say("failed", status === S.DOWNLOAD_FAILED ? "zen-about-update-download-failed" : "zen-about-update-internal-error", null, "nyx-about-manual", manual);
        case S.CHECKING_FAILED:
          return say("failed", "zen-about-update-checking-failed", null, "nyx-about-try-again", () => updater.check());
        case S.MANUAL_UPDATE:
          return say("available", "zen-about-update-manual", null, "nyx-about-manual", manual);
        case S.UNSUPPORTED_SYSTEM:
          return say("blocked", "zen-about-update-unsupported");
        case S.UPDATE_DISABLED_BY_POLICY:
          return say("blocked", "zen-about-update-policy-disabled");
        case S.OTHER_INSTANCE_HANDLING_UPDATES:
          return say("blocked", "zen-about-update-other-instance");
        default:
          return say("none", "");
      }
    };
    updater.addListener(listener);
    updater.check();
    window.addEventListener("unload", () => {
      updater.removeListener(listener);
      updater.stop();
    }, { once: true });
  },
};

var gNyxSyncPane = {
  init() {
    const { SyncHelpers } = ChromeUtils.importESModule("chrome://browser/content/preferences/config/account-sync.mjs", { global: "current" });
    document.getElementById("nyxSyncSignIn").addEventListener("command", () => SyncHelpers.signIn());
    document.getElementById("nyxSyncSignOut").addEventListener("command", () => SyncHelpers.unlinkFirefoxAccount(true));
    document.getElementById("nyxSyncNow").addEventListener("command", () => Weave.Service.sync({ why: "aboutprefs" }));
    const show = () => this.show();
    Services.obs.addObserver(show, UIState.ON_UPDATE);
    window.addEventListener("unload", () => Services.obs.removeObserver(show, UIState.ON_UPDATE), { once: true });
    this.show();
  },

  show() {
    const state = UIState.get();
    const signedIn = state.status === UIState.STATUS_SIGNED_IN;
    const known = state.status !== UIState.STATUS_NOT_CONFIGURED;
    const note = document.getElementById("nyxSyncStatus");
    if (!known) {
      document.l10n.setAttributes(note, "nyx-sync-signed-out");
    } else if (signedIn) {
      document.l10n.setAttributes(note, state.syncing ? "nyx-sync-syncing" : "nyx-sync-signed-in", { email: state.email ?? "" });
    } else {
      document.l10n.setAttributes(note, "nyx-sync-needs-attention", { email: state.email ?? "" });
    }
    document.getElementById("nyxSyncSignIn").hidden = signedIn;
    document.getElementById("nyxSyncNow").hidden = !signedIn;
    document.getElementById("nyxSyncSignOut").hidden = !known;
    document.getElementById("nyxSyncEnginesGroup").toggleAttribute("nyx-disabled", !signedIn);
  },
};

/* Where Firefox's and Zen's panes, and the links to them, lead in Browser's Settings. Settings
 * shows only Browser's panes; Zen's keyboard shortcuts stay as Gestures' sub-page. */
const NYX_PANES = {
  general: "nyxGeneral",
  home: "nyxStart",
  search: "nyxSearch",
  privacy: "nyxBlocking",
  sync: "nyxSync",
  containers: "nyxTabs-containers",
  experimental: "nyxGeneral",
  moreFromMozilla: "nyxGeneral",
  about: "nyxGeneral",
  passwordsAutofill: "nyxPasswords",
  appearance: "nyxAppearance",
  downloads: "nyxDownloads",
  tabsBrowsing: "nyxTabs",
  accessibility: "nyxGeneral",
  languages: "nyxGeneral",
  translations: "nyxGeneral",
  profiles: "nyxGeneral",
  ai: "nyxGeneral",
  permissionsData: "nyxPermissions",
  searchResults: "nyxGeneral",
  zenLooks: "nyxAppearance",
  zenTabManagement: "nyxTabs",
  zenMarketplace: "nyxAppearance",
  nyxToolbar: "nyxTabs",
  nyxIntegrations: "nyxGeneral",
};
// Privacy's sections that are Browser's Permissions.
const NYX_PERMISSION_SECTIONS = /^(permissions|addons|location|camera|microphone|notifications|autoplay|popups|xr)/;

/** A pane name or address anchor ("privacy-permissions", "paneSearch") as Browser's pane. */
function nyxPaneFor(name) {
  const [pane, ...rest] = name.split("-");
  const section = rest.join("-");
  const friendly = pane.replace(/^pane(.)/, (match, first) => first.toLowerCase());
  let mapped = NYX_PANES[friendly];
  if (friendly === "privacy" && NYX_PERMISSION_SECTIONS.test(section)) {
    mapped = "nyxPermissions";
  }
  if (!mapped) {
    return name;
  }
  return section ? `${mapped}-${section}` : mapped;
}

/* Find in Settings: every row of every pane whose words match, under its pane's name, the words
 * marked. Leaving Find goes back to the pane you were on. */
var gNyxFind = {
  panes: [
    "paneNyxGeneral",
    "paneNyxAppearance",
    "paneNyxTabs",
    "paneNyxStart",
    "paneNyxSearch",
    "paneNyxBlocking",
    "paneNyxPasswords",
    "paneNyxPermissions",
    "paneNyxVpn",
    "paneNyxSelection",
    "paneNyxStyles",
    "paneNyxScripts",
    "paneNyxYouTube",
    "paneNyxDownloads",
    "paneNyxGestures",
    "paneNyxExtensions",
    "paneNyxSync",
    "paneNyxAbout",
  ],

  init() {
    this.input = document.getElementById("nyxFind");
    this.input.addEventListener("input", () => this.find(this.input.value));
    this.input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        this.input.value = "";
        this.find("");
      }
    });
    window.addEventListener("keydown", event => {
      if (event.key === "f" && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault();
        this.input.focus();
        this.input.select();
      }
    });
    // Choosing a section, or a link to another pane, leaves Find.
    const leave = () => {
      if (this.input.value) {
        this.input.value = "";
        this.clear();
      }
    };
    document.getElementById("categories").addEventListener("change-view", leave);
    document.addEventListener("paneshown", event => {
      if (event.detail.category !== this.pane) {
        leave();
      }
    });
  },

  /** Every pane's rows, its template put in place first. */
  all() {
    for (const pane of this.panes) {
      gCategoryInits.get(pane)?.init();
    }
    return document.querySelectorAll(this.panes.map(pane => `#mainPrefPane > [data-category="${pane}"]`).join(","));
  },

  clear() {
    document.body.removeAttribute("nyx-finding");
    for (const node of document.querySelectorAll(".nyx-unfound, .nyx-found-pane, .nyx-first, .nyx-last")) {
      node.classList.remove("nyx-unfound", "nyx-found-pane", "nyx-first", "nyx-last");
    }
    for (const mark of document.querySelectorAll("mark.nyx-mark")) {
      mark.replaceWith(mark.textContent);
    }
    document.getElementById("nyxFindHead")?.remove();
  },

  find(text) {
    const query = text.trim().toLowerCase();
    this.clear();
    if (!query) {
      const pane = gLastCategory.category || "paneNyxGeneral";
      search(pane, "data-category");
      document.getElementById("categories").currentView = pane;
      return;
    }
    document.body.setAttribute("nyx-finding", "true");
    this.pane = gLastCategory.category;
    // A view no section has: none is selected (an empty one would select the first).
    document.getElementById("categories").currentView = "nyxFind";
    const sections = this.all();
    let found = 0;
    const panes = new Set();
    for (const section of sections) {
      if (section.classList.contains("nyx-pane-head")) {
        section.hidden = true;
        continue;
      }
      const hits = [];
      for (const row of section.querySelectorAll(":scope > .nyx-row")) {
        const hit = this.words(row).includes(query);
        row.classList.toggle("nyx-unfound", !hit);
        if (hit) {
          hits.push(row);
          this.mark(row, query);
        }
      }
      found += hits.length;
      hits[0]?.classList.add("nyx-first");
      hits.at(-1)?.classList.add("nyx-last");
      const any = hits.length > 0;
      section.hidden = !any;
      if (any && !panes.has(section.dataset.category)) {
        panes.add(section.dataset.category);
        section.classList.add("nyx-found-pane");
        section.dataset.paneTitle = document.getElementById(`category-${this.navId(section.dataset.category)}`)?.textContent.trim() ?? "";
      }
    }
    const head = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    head.id = "nyxFindHead";
    head.className = "nyx-find-head";
    const title = document.createElementNS("http://www.w3.org/1999/xhtml", "h1");
    const sub = document.createElementNS("http://www.w3.org/1999/xhtml", "p");
    sub.className = "nyx-pane-sub";
    document.l10n.setAttributes(title, "nyx-find-results", { query: text.trim() });
    document.l10n.setAttributes(sub, found ? "nyx-find-count" : "nyx-find-none", { count: found, panes: panes.size });
    head.append(title, sub);
    document.getElementById("mainPrefPane").prepend(head);
  },

  navId(pane) {
    return pane.replace(/^paneNyx/, "nyx-").toLowerCase();
  },

  /** A row's words: its labels, notes and choices. */
  words(row) {
    const parts = [];
    for (const node of row.querySelectorAll("label, description, checkbox, radio, menuitem, button")) {
      parts.push(node.getAttribute("label") ?? "", node.getAttribute("value") ?? "", node.textContent ?? "");
    }
    return parts.join(" ").toLowerCase();
  },

  /** Marks the words in the row's names and notes. */
  mark(row, query) {
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
      const index = walker.currentNode.data.toLowerCase().indexOf(query);
      if (index >= 0) {
        hits.push([walker.currentNode, index]);
      }
    }
    for (const [node, index] of hits) {
      const rest = node.splitText(index);
      rest.splitText(query.length);
      const mark = document.createElementNS("http://www.w3.org/1999/xhtml", "mark");
      mark.className = "nyx-mark";
      mark.textContent = rest.data;
      rest.replaceWith(mark);
    }
  },
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => gNyxFind.init(), { once: true });
} else {
  gNyxFind.init();
}
