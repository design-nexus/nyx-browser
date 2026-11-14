/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Share button's dropdown: the page with Copy link, the apps Nyx Share sends its address to
// in one click as round tiles, nearby devices, and More in Share for the full Share window. The
// list comes from `nyx-browser-bridge share-destinations` and is sent with `share-to`
// (share_menu.rs in the bridge). The QR code is Browser's own, drawn in the dropdown.

import { NyxBridge } from "chrome://browser/content/nyx/NyxBridge.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
  QRCodeGenerator: "moz-src:///browser/components/qrcode/QRCodeGenerator.sys.mjs",
});

const VIEW_ID = "PanelUI-nyx-share";
const UNAVAILABLE = "Share isn't available.";
const HTML = "http://www.w3.org/1999/xhtml";
// Share's own QR destination: the dropdown draws the code itself instead.
const SHARE_QR = "nyx-share-qr-symbolic";

// Share's symbolic icon names, drawn with Browser's own icons.
const ICONS = {
  "edit-copy-symbolic": "copy",
  "nyx-share-qr-symbolic": "qr",
  "phone-symbolic": "phone",
  "computer-symbolic": "computer",
  "mail-send-symbolic": "mail",
  "accessories-text-editor-symbolic": "note",
  "chat-message-new-symbolic": "message",
  "folder-remote-symbolic": "cloud",
  "folder-download-symbolic": "download",
};
const icon = name => `chrome://browser/content/nyx/icons/${ICONS[name] ?? name ?? "share"}.svg`;

/** The last list, shown at once the next time while a fresh one is read. */
let known = null;

const bridge = args => NyxBridge.run(args, UNAVAILABLE);

/** The selected tab's address, if it's a web page. */
function pageAddress(window) {
  const url = lazy.BrowserUtils.getShareableURL(window.gBrowser.currentURI);
  return url && (url.schemeIs("http") || url.schemeIs("https")) ? url.spec : null;
}

function html(document, tag, className, text) {
  const node = document.createElementNS(HTML, tag);
  if (className) {
    node.className = className;
  }
  if (text) {
    node.textContent = text;
  }
  return node;
}

function img(document, src, className) {
  const node = html(document, "img", className);
  node.src = src;
  node.alt = "";
  return node;
}

function note(document, l10nId, text) {
  const description = document.createXULElement("description");
  description.className = "nyx-share-note";
  if (l10nId) {
    document.l10n.setAttributes(description, l10nId);
  } else {
    description.textContent = text;
  }
  return description;
}

function tint(destination) {
  return destination.tint && destination.tint !== "graphite"
    ? `var(--nyx-swatch-${destination.tint}, var(--nyx-accent))`
    : "var(--nyx-swatch-graphite, var(--nyx-dim))";
}

/** The page: its icon, title and address, and Copy link. */
function pageCard(document, window, url) {
  const tab = window.gBrowser.selectedTab;
  const card = html(document, "div", "nyx-share-page");
  const fav = html(document, "span", "nyx-share-favicon");
  if (tab.getAttribute("image")) {
    fav.append(img(document, tab.getAttribute("image")));
  }
  const text = html(document, "div", "nyx-share-page-text");
  text.append(html(document, "b", null, tab.label), html(document, "small", null, url ? new URL(url).host : ""));
  const copy = html(document, "button", "nyx-share-copy");
  document.l10n.setAttributes(copy, "nyx-share-copy-link");
  copy.append(img(document, icon("copy")));
  copy.disabled = !url;
  copy.addEventListener("click", () => {
    Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(url);
    window.CustomizableUI.hidePanelForNode(card);
  });
  card.append(fav, text, copy);
  return card;
}

/** An app as a round tile in its colour. */
function tile(document, { name, l10nId, iconName, color, disabled, status, onPick }) {
  const button = html(document, "button", "nyx-share-tile");
  button.style.setProperty("--nyx-share-tint", color);
  const disc = html(document, "span", "nyx-share-disc");
  disc.append(img(document, icon(iconName)));
  const label = html(document, "span", "nyx-share-label", name);
  if (l10nId) {
    document.l10n.setAttributes(label, l10nId);
  }
  button.append(disc, label);
  button.disabled = !!disabled;
  if (disabled) {
    button.title = `${name} — ${status || "unavailable"}`;
  }
  button.addEventListener("click", () => onPick(button));
  return button;
}

/** A device as a card with its state: a dot, and what Share says of it. */
function device(document, destination, onPick) {
  const button = html(document, "button", "nyx-share-device");
  button.dataset.destination = destination.id;
  button.toggleAttribute("nyx-off", !destination.available);
  const avatar = html(document, "span", "nyx-share-avatar");
  avatar.append(img(document, icon(destination.icon)), html(document, "i"));
  button.append(avatar, html(document, "b", null, destination.name), html(document, "small", null, destination.status || ""));
  button.disabled = !destination.available;
  button.addEventListener("click", () => onPick(destination, button));
  return button;
}

export const NyxShareMenu = {
  VIEW_ID,

  /** Makes the view in a window, where CustomizableUI looks for it, with "More in Share…". */
  createView(document, openShareWindow) {
    if (document.getElementById(VIEW_ID)) {
      return;
    }
    const view = document.createXULElement("panelview");
    view.id = VIEW_ID;
    view.className = "PanelUI-subView nyx-share-view";
    // Read now: from More tools the panel titles its header before a cached view is translated.
    const [{ attributes }] = new Localization(["browser/nyx-browser.ftl"], true).formatMessagesSync([{ id: "nyx-share-view" }]);
    view.setAttribute("title", attributes.find(a => a.name === "title").value);
    const body = document.createXULElement("vbox");
    body.className = "panel-subview-body";
    const more = document.createXULElement("toolbarbutton");
    more.className = "subviewbutton subviewbutton-iconic panel-subview-footer-button";
    more.id = "nyx-share-more";
    more.setAttribute("image", "chrome://browser/content/nyx/icons/share.svg");
    document.l10n.setAttributes(more, "nyx-share-more");
    more.addEventListener("command", () => {
      document.defaultView.CustomizableUI.hidePanelForNode(view);
      openShareWindow();
    });
    view.append(body, document.createXULElement("toolbarseparator"), more);
    const cache = document.getElementById("appMenu-viewCache");
    (cache?.content ?? cache ?? document.getElementById("mainPopupSet")).appendChild(view);
  },

  /** Fills the view as it opens: the last list at once, then Share's answer. */
  async show(view) {
    const document = view.ownerDocument;
    const window = document.defaultView;
    const body = view.querySelector(".panel-subview-body");
    const url = pageAddress(window);
    const close = () => window.CustomizableUI.hidePanelForNode(view);

    const pick = async (destination, button) => {
      if (!url) {
        return;
      }
      button.disabled = true;
      try {
        await bridge(["share-to", destination.id, url]);
        close();
      } catch (error) {
        button.disabled = false;
        body.querySelector(".nyx-share-note")?.remove();
        body.append(note(document, null, error.message));
      }
    };

    const showQR = async () => {
      body.replaceChildren();
      const head = html(document, "div", "nyx-share-qr-head");
      const back = html(document, "button", "nyx-share-back");
      document.l10n.setAttributes(back, "nyx-share-back");
      back.append(img(document, icon("back")));
      back.addEventListener("click", () => fill(known));
      const title = html(document, "b");
      document.l10n.setAttributes(title, "nyx-share-qr-title");
      head.append(back, title);
      const box = html(document, "div", "nyx-share-qr");
      const caption = html(document, "p", "nyx-share-qr-caption");
      document.l10n.setAttributes(caption, "nyx-share-qr-caption");
      const save = html(document, "button", "nyx-share-action");
      document.l10n.setAttributes(save, "nyx-share-qr-save");
      save.disabled = true;
      body.append(head, pageCard(document, window, url), box, caption, save);
      try {
        const data = await lazy.QRCodeGenerator.generateQRCode(url);
        box.append(img(document, data));
        save.disabled = false;
        save.addEventListener("click", async () => {
          const folder = await lazy.Downloads.getPreferredDownloadsDirectory();
          const target = PathUtils.join(folder, `QR ${new URL(url).host}.png`);
          const download = await lazy.Downloads.createDownload({ source: data, target });
          (await lazy.Downloads.getList(lazy.Downloads.PUBLIC)).add(download);
          download.start();
          close();
        });
      } catch (error) {
        box.append(note(document, null, error.message));
      }
    };

    const fill = (list, error) => {
      body.replaceChildren(pageCard(document, window, url));
      if (error) {
        body.append(note(document, null, error));
        return;
      }
      const tiles = html(document, "div", "nyx-share-tiles");
      tiles.append(
        tile(document, { l10nId: "nyx-share-qr-tile", iconName: "qr", color: "var(--nyx-swatch-violet, var(--nyx-accent))", disabled: !url, onPick: showQR })
      );
      body.append(tiles);
      if (!list) {
        body.append(note(document, "nyx-share-looking"));
        return;
      }
      const apps = list.filter(d => d.section === "apps" && d.icon !== SHARE_QR);
      const devices = list.filter(d => d.section !== "apps");
      for (const d of apps) {
        tiles.append(
          tile(document, {
            name: d.name,
            iconName: d.icon,
            color: tint(d),
            disabled: !d.available || !url,
            status: d.status,
            onPick: button => pick(d, button),
          })
        );
      }
      if (devices.length) {
        const header = document.createXULElement("label");
        header.className = "subview-subheader nyx-share-subheader";
        document.l10n.setAttributes(header, "nyx-share-devices");
        const row = html(document, "div", "nyx-share-devices");
        row.append(...devices.map(d => device(document, d, pick)));
        body.append(header, row);
      }
      if (!apps.length && !devices.length) {
        body.append(note(document, "nyx-share-nowhere"));
      }
    };

    fill(known);
    try {
      known = await bridge(["share-destinations"]);
      fill(known);
    } catch (error) {
      fill(null, error.message);
    }
  },
};
