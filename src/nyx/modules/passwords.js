/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Nyx Passwords in a window: the Passwords button's popup, the menu under a field, the save bar
 * and the passkey card. Each is one of Passwords' own pages (popup.html, menu.html, bar.html,
 * passkey.html), loaded from where Passwords is installed into a frame of this window, with a
 * stand-in for the few extension APIs they use; what they ask goes to NyxPasswords. Also the
 * shortcuts (Alt+Shift+Y the popup, Ctrl+Shift+L fill, Ctrl+Shift+9 a new password) and the
 * page menu's Fill and Generate. */
{
  const { NyxActors } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxActors.sys.mjs");
  const { NyxPasswords, PAGES } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxPasswords.sys.mjs");
  const { NyxTheme } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxTheme.sys.mjs");
  NyxActors.register();

  const HTML = "http://www.w3.org/1999/xhtml";
  const BUTTON = "nyx-passwords-button";
  const CALLER = "nyx-passwords@design-nexus.github.io";
  let themeCss = "";

  // ---- the frames Passwords' pages load in ----

  /** Which of Passwords' pages a frame of this window has loaded, by the frame. */
  const frames = new Map();

  /** A frame for one of Passwords' pages: a content browser in this process, as Firefox shows
   * its own resource: pages, so the page has its own principal, not the window's. */
  function frame(kind, width, height) {
    const node = document.createXULElement("browser");
    node.className = `nyx-passwords-frame nyx-passwords-${kind}`;
    node.setAttribute("type", "content");
    node.setAttribute("disableglobalhistory", "true");
    node.setAttribute("transparent", "true");
    node.setAttribute("nodefaultsrc", "true");
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    frames.set(node, kind);
    return node;
  }

  const go = (host, url) =>
    host.fixupAndLoadURIString(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });

  /** Loads a page into a panel's frame: now if the panel is showing, else once it is (a closed
   * panel's frame isn't there to load into). */
  function load(node, host, url) {
    if (node.state === "open") {
      go(host, url);
    } else {
      node.addEventListener("popupshown", () => go(host, url), { once: true });
    }
  }

  function panel(id) {
    const node = document.createXULElement("panel");
    node.id = id;
    node.className = "nyx-passwords-panel";
    node.setAttribute("noautofocus", "true");
    node.setAttribute("consumeoutsideclicks", "false");
    document.getElementById("mainPopupSet").append(node);
    return node;
  }

  /** The stand-in for the extension APIs Passwords' pages use, put in before their scripts run. */
  function serve(win, kind, frameHost) {
    const host = frameHost.closest("panel");
    listen(win, kind, frameHost);
    const send = message =>
      new win.Promise((resolve, reject) => {
        let plain;
        try {
          plain = JSON.parse(JSON.stringify(message));
        } catch {
          reject(new win.Error("unreadable"));
          return;
        }
        NyxPasswords.fromPage(kind, plain, window).then(
          answer => resolve(Cu.cloneInto(answer ?? null, win)),
          error => resolve(Cu.cloneInto({ error: String(error) }, win))
        );
      });
    const get = () =>
      new win.Promise(resolve => {
        NyxPasswords.stored().then(({ theme, icons }) => resolve(Cu.cloneInto({ theme, icons }, win)));
      });
    const listeners = [];
    const stop = NyxPasswords.onStoreChange(change => {
      if ("theme" in change) {
        for (const listener of listeners) {
          try {
            listener(Cu.cloneInto({ theme: { newValue: change.theme } }, win));
          } catch {}
        }
      }
    });
    win.addEventListener("unload", stop, { once: true });
    const api = {
      runtime: { id: CALLER, sendMessage: send, getURL: path => `${PAGES}${path}` },
      storage: { local: { get }, onChanged: { addListener: listener => listeners.push(listener) } },
      tabs: {
        create: ({ url }) =>
          new win.Promise(resolve => {
            if (/^https?:/.test(String(url))) {
              openTrustedLinkIn(String(url), "tab");
            }
            resolve();
          }),
      },
    };
    const waived = Cu.waiveXrays(win);
    waived.browser = Cu.cloneInto(api, win, { cloneFunctions: true });
    // A page closing itself closes the panel it's in.
    waived.close = Cu.exportFunction(() => host?.hidePopup?.() ?? PanelUI.hide(), win);
    if (themeCss) {
      win.windowUtils.loadSheetUsingURIString(`data:text/css;charset=utf-8,${encodeURIComponent(themeCss)}`, win.windowUtils.AUTHOR_SHEET);
    }
  }

  const served = {
    observe(doc) {
      const host = doc.defaultView?.browsingContext?.embedderElement;
      const kind = host && frames.get(host);
      if (kind && doc.documentURI.startsWith(PAGES)) {
        serve(doc.defaultView, kind, host);
      }
    },
  };
  Services.obs.addObserver(served, "document-element-inserted");

  /** A page asks to be closed or fitted to its height: it posts to `parent`, which, at the top of
   * its browser, is its own window. */
  function listen(win, kind, host) {
    win.addEventListener("message", event => {
      const what = event.data?.nyx;
      if (event.source !== win || typeof what !== "string") {
        return;
      }
      if (what.endsWith("-close")) {
        host.closest("panel")?.hidePopup();
      } else if (what.endsWith("-height")) {
        const max = kind === "passkey" ? 480 : 320;
        host.style.height = `${Math.min(max, Math.max(48, Number(event.data.height) || 0))}px`;
      }
    });
  }

  // ---- the button's popup ----

  let popupFrame = null;
  function popupView(view) {
    if (!popupFrame) {
      popupFrame = frame("popup", 760, 560);
      view.querySelector(".panel-subview-body").append(popupFrame);
    }
    go(popupFrame, `${PAGES}popup.html`);
    view.addEventListener("ViewHiding", () => go(popupFrame, "about:blank"), { once: true });
  }

  function openPopup() {
    const node = CustomizableUI.getWidget(BUTTON)?.forWindow(window)?.node;
    if (node && !node.hidden) {
      node.click();
    }
  }

  // ---- the menu under a field ----

  let menu = null;
  let menuFrame = null;
  let menuFor = null;

  function showMenu(browser, token, rect) {
    if (browser !== gBrowser.selectedBrowser) {
      return;
    }
    if (!menu) {
      menu = panel("nyx-passwords-menu");
      menuFrame = frame("menu", 340, 220);
      menu.append(menuFrame);
    }
    const scale = window.devicePixelRatio;
    const width = Math.min(380, Math.max(300, (rect.right - rect.left) / scale));
    menuFrame.style.width = `${width}px`;
    menuFrame.style.height = "220px";
    load(menu, menuFrame, `${PAGES}menu.html#${token}`);
    menuFor = browser;
    const x = rect.left / scale;
    let y = rect.bottom / scale + 4;
    if (y + 240 > screen.availTop + screen.availHeight) {
      y = rect.top / scale - 4 - 240;
    }
    if (menu.state === "open" || menu.state === "showing") {
      menu.moveTo(x, y);
    } else {
      menu.openPopupAtScreen(x, y, false);
    }
  }

  function hideMenu() {
    menu?.hidePopup();
    menuFor = null;
  }

  /** The field lost the cursor: the menu goes, unless that's because the person went into it. */
  function fieldLeft(browser) {
    if (browser !== menuFor) {
      return;
    }
    setTimeout(() => {
      if (menu && !menu.matches(":hover") && !menu.contains(document.activeElement)) {
        hideMenu();
      }
    }, 150);
  }

  // ---- the save bar and the passkey card, under the button (or the site's identity) ----

  function anchorFor() {
    const node = CustomizableUI.getWidget(BUTTON)?.forWindow(window)?.anchor;
    return node?.checkVisibility?.() ? node : document.getElementById("identity-icon-box") ?? gURLBar.textbox;
  }

  let bar = null;
  let barFrame = null;
  let barTimer = null;
  function showBar(browser, token) {
    if (browser !== gBrowser.selectedBrowser) {
      return;
    }
    if (!bar) {
      bar = panel("nyx-passwords-bar");
      barFrame = frame("bar", 400, 152);
      bar.append(barFrame);
    }
    load(bar, barFrame, `${PAGES}bar.html#${token}`);
    bar.openPopup(anchorFor(), "bottomright topright", 0, 4);
    clearTimeout(barTimer);
    barTimer = setTimeout(() => bar.hidePopup(), 60_000);
  }

  let card = null;
  let cardFrame = null;
  function showPasskey(browser, token) {
    if (browser !== gBrowser.selectedBrowser || document.fullscreenElement) {
      return false;
    }
    if (!card) {
      card = panel("nyx-passwords-passkey");
      card.setAttribute("noautohide", "true");
      cardFrame = frame("passkey", 400, 180);
      card.append(cardFrame);
    }
    load(card, cardFrame, `${PAGES}passkey.html#${token}`);
    card.openPopup(document.getElementById("identity-icon-box") ?? gURLBar.textbox, "bottomleft topleft", 0, 4);
    return true;
  }

  window.NyxPasswordsUI = { popupView, showMenu, fieldLeft, showBar, showPasskey, openPopup };

  // ---- the theme, for the pages and for the key in pages' fields ----

  const stopTheme = NyxTheme.subscribe(css => {
    themeCss = css;
    const token = name => new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css)?.[1]?.trim();
    const accent = token("--nyx-accent");
    const onAccent = token("--nyx-on-accent");
    if (accent && onAccent && /^#[0-9a-f]{3,8}$/i.test(accent) && /^#[0-9a-f]{3,8}$/i.test(onAccent)) {
      Services.prefs.setStringPref("nyx.passwords.accent", `${accent} ${onAccent}`);
    }
  });

  // ---- shortcuts and the page menu ----

  window.addEventListener(
    "keydown",
    event => {
      const key = event.key.toLowerCase();
      if (event.altKey && event.shiftKey && !event.ctrlKey && event.code === "KeyY") {
        openPopup();
      } else if (event.ctrlKey && event.shiftKey && !event.altKey && key === "l") {
        NyxPasswords.fillShortcut(window).then(found => found || openPopup());
      } else if (event.ctrlKey && event.shiftKey && !event.altKey && event.code === "Digit9") {
        NyxPasswords.generateInto(window);
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  const pageMenu = document.getElementById("contentAreaContextMenu");
  pageMenu?.addEventListener("popupshowing", event => {
    if (event.target !== pageMenu) {
      return;
    }
    pageMenu.querySelectorAll(".nyx-passwords-item").forEach(n => n.remove());
    if (!/^https?:/.test(gBrowser.currentURI.spec)) {
      return;
    }
    const item = (l10nId, onCommand) => {
      const node = document.createXULElement("menuitem");
      node.className = "nyx-passwords-item menuitem-iconic";
      node.setAttribute("image", "chrome://browser/content/nyx/icons/key.svg");
      document.l10n.setAttributes(node, l10nId);
      node.addEventListener("command", onCommand);
      return node;
    };
    const items = [item("nyx-passwords-fill", () => NyxPasswords.fillShortcut(window).then(found => found || openPopup()))];
    if (gContextMenu?.onEditable) {
      items.push(item("nyx-passwords-generate", () => NyxPasswords.generateInto(window)));
    }
    const separator = document.createXULElement("menuseparator");
    separator.className = "nyx-passwords-item";
    (document.getElementById("context-sep-navigation") ?? pageMenu.firstChild).after(...items, separator);
  });

  // ---- tabs ----

  const STATE = Ci.nsIWebProgressListener;
  const progress = {
    onStateChange(browser, webProgress, request, flags) {
      if (webProgress.isTopLevel && flags & STATE.STATE_STOP && flags & STATE.STATE_IS_WINDOW) {
        NyxPasswords.loaded(browser);
      }
    },
    onLocationChange(browser, webProgress) {
      if (webProgress.isTopLevel && browser === menuFor) {
        hideMenu();
      }
    },
  };
  gBrowser.addTabsProgressListener(progress);
  gBrowser.tabContainer.addEventListener("TabSelect", hideMenu);
  gBrowser.tabContainer.addEventListener("TabClose", event => NyxPasswords.forgetTab(event.target.linkedBrowser));

  window.addEventListener(
    "unload",
    () => {
      Services.obs.removeObserver(served, "document-element-inserted");
      gBrowser.removeTabsProgressListener(progress);
      stopTheme();
    },
    { once: true }
  );
}
