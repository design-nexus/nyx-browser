/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The Site card, from the padlock, as the layouts' mockups have it: the site and its connection,
 * Blocking, Passwords, VPN and Reader as tiles, what to do with the page (copy, share, QR code, open
 * in, capture), the site's permissions, and its data. Each tile opens its own panel. Firefox's
 * connection details stay one click away, so nothing about the connection is hidden. */
{
  const HTML = "http://www.w3.org/1999/xhtml";
  const ICONS = "chrome://browser/content/nyx/icons";
  // Permissions every site lists, set or not; others show once a site has one.
  const LISTED = ["geo", "camera", "microphone", "desktop-notification", "autoplay-media"];
  const NAMES = {
    geo: "location",
    camera: "camera",
    microphone: "microphone",
    "desktop-notification": "notifications",
    "autoplay-media": "autoplay",
    popup: "popups",
    "persistent-storage": "storage",
    xr: "vr",
    screen: "screen",
  };
  const PERM_ICONS = { geo: "globe", camera: "capture", microphone: "sound", "desktop-notification": "message", "autoplay-media": "sound", popup: "popup" };

  const strings = new Localization(["browser/nyx-browser.ftl"], true);
  const t = (id, args) => strings.formatValueSync(`nyx-site-${id}`, args);

  const el = (tag, cls = "", text = "") => {
    const node = document.createElementNS(HTML, tag);
    if (cls) {
      node.className = cls;
    }
    if (text) {
      node.textContent = text;
    }
    return node;
  };
  const icon = name => {
    const img = el("img", "nyx-sc-icon");
    img.src = `${ICONS}/${name}.svg`;
    img.alt = "";
    return img;
  };

  let panel = null;
  function card() {
    if (!panel) {
      panel = document.createXULElement("panel");
      panel.id = "nyx-site-card";
      panel.setAttribute("type", "arrow");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", t("card-title"));
      panel.append(el("div", "nyx-sc"));
      document.getElementById("mainPopupSet").append(panel);
    }
    return panel;
  }

  const close = () => panel?.hidePopup();
  /** A button's view, as a panel of its own from where the card was. */
  function openView(viewId, buttonId) {
    close();
    const button = document.getElementById(buttonId);
    if (button?.checkVisibility()) {
      button.click();
    } else {
      PanelUI.showSubView(viewId, document.getElementById("identity-icon-box"));
    }
  }

  function tile(glyph, name, state, on, run) {
    const node = el("button", "nyx-sc-tile");
    node.toggleAttribute("on", on);
    const disc = el("span", "nyx-sc-disc");
    disc.append(icon(glyph));
    const text = el("span", "nyx-sc-tile-text");
    text.append(el("b", "", name), el("span", "", state));
    node.append(disc, text);
    node.addEventListener("click", run);
    return node;
  }

  function action(glyph, label, run, enabled = true) {
    const node = el("button", "nyx-sc-act");
    node.disabled = !enabled;
    const disc = el("span", "nyx-sc-disc");
    disc.append(icon(glyph));
    node.append(disc, el("span", "", label));
    node.addEventListener("click", () => {
      close();
      run();
    });
    return node;
  }

  function permissions(browser) {
    const principal = gBrowser.contentPrincipal;
    const set = new Map(SitePermissions.getAllForBrowser(browser).map(p => [p.id, p.state]));
    const ids = [...new Set([...LISTED, ...set.keys()])].filter(id => NAMES[id]);
    const box = el("div", "nyx-sc-perms");
    box.append(el("div", "nyx-sc-head", t("permissions")));
    const words = state =>
      state === SitePermissions.ALLOW ? [t("permission-allowed"), "yes"] : state === SitePermissions.BLOCK ? [t("permission-blocked"), "no"] : [t("permission-ask"), ""];
    for (const id of ids) {
      const row = el("button", "nyx-sc-perm");
      const [word, kind] = words(set.get(id) ?? SitePermissions.UNKNOWN);
      const value = el("em", kind, id === "autoplay-media" && !set.has(id) ? t("permission-block-audio") : word);
      row.append(icon(PERM_ICONS[id] ?? "shield"), el("span", "", t(`permission-${NAMES[id]}`)), value);
      row.title = t("permission-cycle");
      row.addEventListener("click", () => {
        const now = set.get(id) ?? SitePermissions.UNKNOWN;
        const next = now === SitePermissions.UNKNOWN ? SitePermissions.ALLOW : now === SitePermissions.ALLOW ? SitePermissions.BLOCK : SitePermissions.UNKNOWN;
        if (next === SitePermissions.UNKNOWN) {
          SitePermissions.removeFromPrincipal(principal, id, browser);
        } else {
          SitePermissions.setForPrincipal(principal, id, next, SitePermissions.SCOPE_PERSISTENT, browser);
        }
        fill();
      });
      box.append(row);
    }
    return box;
  }

  function fill() {
    const browser = gBrowser.selectedBrowser;
    const uri = gBrowser.currentURI;
    const body = card().firstChild;
    const secure = gIdentityHandler._isSecureConnection;
    const issuer = gIdentityHandler._secInfo?.serverCert?.issuerOrganization;
    const host = (() => {
      try {
        return uri.displayHost.replace(/^www\./, "");
      } catch {
        return uri.displaySpec;
      }
    })();

    const head = el("div", "nyx-sc-site");
    const fav = el("img", "nyx-sc-fav");
    fav.src = gBrowser.selectedTab.getAttribute("image") || "chrome://global/skin/icons/defaultFavicon.svg";
    fav.alt = "";
    const text = el("div", "nyx-sc-site-text");
    const line = el("span", secure ? "ok" : "warn");
    line.append(icon(secure ? "lock" : "warning"), document.createTextNode(secure ? (issuer ? t("secure-by", { issuer }) : t("secure")) : t("not-secure")));
    text.append(el("b", "", host), line);
    head.append(fav, text);

    const shield = document.getElementById("nyx-shield-button");
    const blocked = shield?.querySelector(".nyx-shield-count")?.textContent || "";
    const blocking = shield && !shield.hidden && !shield.hasAttribute("nyx-off");
    const tiles = el("div", "nyx-sc-tiles");
    tiles.append(
      tile("shield", t("blocking"), blocking ? (blocked ? t("blocked", { count: blocked }) : t("blocked-none")) : t("off"), blocking, () => {
        close();
        shield?.click();
      }),
      tile("key", t("passwords"), t("passwords-state"), false, () => openView("PanelUI-nyx-passwords", "nyx-passwords-button")),
      tile("globe", t("vpn"), document.getElementById("nyx-vpn-button")?.hasAttribute("nyx-on") ? t("vpn-on") : t("off"), document.getElementById("nyx-vpn-button")?.hasAttribute("nyx-on"), () => openView("PanelUI-nyx-vpn", "nyx-vpn-button")),
      tile("browser", t("reader"), browser.isArticle ? t("reader-available") : t("reader-unavailable"), false, () => {
        close();
        document.getElementById("reader-mode-button")?.click();
      })
    );
    tiles.lastChild.disabled = !browser.isArticle;

    const acts = el("div", "nyx-sc-acts");
    acts.append(
      action("link", t("copy-link"), () => Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(uri.displaySpec)),
      action("share", t("share"), () => document.getElementById("nyx-share-button")?.click()),
      action("qr", t("qr"), () => document.getElementById("nyx-qr-button")?.click(), !!document.getElementById("nyx-qr-button")),
      action("openin", t("open-in"), () => PanelUI.showSubView("PanelUI-nyx-openin", document.getElementById("identity-icon-box"))),
      action("capture", t("capture"), () => document.getElementById("nyx-capture-button")?.doCommand())
    );

    const onsite = el("div", "nyx-sc-onsite");
    onsite.append(el("div", "nyx-sc-head", t("onsite")));
    try {
      const { scriptsInTab } = ChromeUtils.importESModule("resource://nyx/actors/NyxSiteParent.sys.mjs");
      const { NyxSiteKit } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxSiteKit.sys.mjs");
      const { sectionMatches } = ChromeUtils.importESModule("resource://nyx/actors/NyxSiteCode.sys.mjs");
      const url = uri.spec;
      const hostOf = () => {
        try {
          return new URL(url).hostname;
        } catch {
          return "";
        }
      };
      NyxSiteKit.styles().then(({ builtin, mine }) => {
        for (const style of [...builtin.map(s => ({ ...s, builtin: true })), ...mine]) {
          const sections = style.sections || [];
          const hosts = style.hosts || [];
          const matches = sections.length
            ? sections.some(s => sectionMatches(s, url))
            : hosts.some(h => {
                const host = hostOf();
                return host === h || host.endsWith(`.${h}`);
              });
          if (!matches) {
            continue;
          }
          const row = el("div", "nyx-sc-style");
          const text = el("span", "nyx-sc-style-text");
          text.append(el("b", "", style.name), el("span", "", style.builtin ? t("style-browser") : t("style-yours")));
          const toggle = document.createXULElement("checkbox");
          toggle.className = "nyx-switch nyx-switch-only";
          toggle.checked = style.enabled !== false;
          toggle.addEventListener("command", () => {
            if (style.builtin) {
              NyxSiteKit.setBuiltinEnabled(style.id, toggle.checked);
            } else {
              NyxSiteKit.updateStyle(style.id, { enabled: toggle.checked });
            }
          });
          row.append(icon("palette"), text, toggle);
          onsite.append(row);
        }
        for (const script of scriptsInTab(browser)) {
          const row = el("div", "nyx-sc-style");
          const text = el("span", "nyx-sc-style-text");
          text.append(el("b", "", script.name), el("span", "", t("script-running")));
          row.append(icon("code"), text);
          for (const menu of script.menus) {
            const btn = el("button", "nyx-sc-menu", menu.caption);
            btn.addEventListener("click", () => {
              menu.run();
              close();
            });
            row.append(btn);
          }
          onsite.append(row);
        }
        if (onsite.childElementCount === 1) {
          onsite.hidden = true;
        }
      }).catch(() => {
        onsite.hidden = true;
      });
    } catch {
      onsite.hidden = true;
    }

    const foot = el("div", "nyx-sc-foot");
    const link = (label, run) => {
      const node = el("button", "nyx-sc-link", label);
      node.addEventListener("click", () => {
        close();
        run();
      });
      return node;
    };
    foot.append(
      link(t("clear-data"), () => gIdentityHandler.clearSiteData?.(new MouseEvent("click"))),
      el("span", "nyx-sc-grow"),
      link(t("styles-link"), () => openPreferences("paneNyxStyles")),
      link(t("connection"), () => {
        const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, view: window });
        click.nyxFirefox = true;
        document.getElementById("identity-icon-box").dispatchEvent(click);
      }),
      link(t("all-settings"), () => openPreferences("privacy-permissions"))
    );
    body.replaceChildren(head, tiles, onsite, acts, permissions(browser), foot);
  }

  function open() {
    fill();
    card().openPopup(document.getElementById("identity-icon-box"), "bottomleft topleft", 0, 4);
  }

  // The padlock opens the card; Firefox's own panel is the card's Connection details.
  const original = gIdentityHandler.handleIdentityButtonEvent;
  gIdentityHandler.handleIdentityButtonEvent = function (event, ...rest) {
    const web = /^https?$/.test(gBrowser.currentURI.scheme);
    const press = event.type === "click" ? event.button === 0 : event.key === "Enter" || event.key === " ";
    if (web && press && !event.nyxFirefox) {
      event.stopPropagation();
      event.preventDefault?.();
      open();
      return;
    }
    return original.call(this, event, ...rest);
  };

  window.NyxSiteCard = { open };
}
