/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Share button's dropdown: a card for the page (a picture of it, its title and address, Copy
// link and Clean link), the apps Nyx Share sends its address to in one click as square tiles,
// nearby devices as chips, and More in Share for the full Share window. The list comes from
// `nyx-browser-bridge share-destinations` and is sent with `share-to` (share_menu.rs in the
// bridge). The QR code is Browser's own, drawn in the dropdown.

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

const copyText = text => Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper).copyString(text);

/** The address without the tracking parts sites add (utm_source and the like). */
function cleanAddress(url) {
  try {
    const stripper = Cc["@mozilla.org/url-query-string-stripper;1"].getService(Ci.nsIURLQueryStringStripper);
    return stripper.stripForCopyOrShare(Services.io.newURI(url))?.spec ?? url;
  } catch {
    return url;
  }
}

/** A picture of the page in front, the width of the card, for its top. */
async function drawPage(document, window, box) {
  const browser = window.gBrowser.selectedBrowser;
  const width = browser.clientWidth;
  if (!width) {
    return;
  }
  const scale = window.devicePixelRatio || 1;
  const w = box.clientWidth || 346, h = box.clientHeight || 110;
  const bitmap = await browser.drawSnapshot(0, 0, width, (width * h) / w, (w * scale) / width, "white");
  const canvas = html(document, "canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  box.replaceChildren(canvas);
}

/** The page: a picture of it, its title and address, Copy link and Clean link. */
function pageCard(document, window, url) {
  const tab = window.gBrowser.selectedTab;
  const close = () => window.CustomizableUI.hidePanelForNode(card);
  const card = html(document, "div", "nyx-share-page");
  card.toggleAttribute("nyx-off", !url);
  const thumb = html(document, "div", "nyx-share-thumb");
  if (tab.getAttribute("image")) {
    thumb.append(img(document, tab.getAttribute("image"), "nyx-share-favicon"));
  }
  if (url) {
    window.requestAnimationFrame(() => drawPage(document, window, thumb).catch(() => {}));
  }
  const text = html(document, "div", "nyx-share-page-text");
  const where = html(document, "small", null, url ? url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : "");
  if (!url) {
    document.l10n.setAttributes(where, "nyx-share-no-address");
  }
  text.append(html(document, "b", null, tab.label), where);
  const buttons = html(document, "div", "nyx-share-page-buttons");
  const copy = html(document, "button", "nyx-share-copy nyx-share-primary");
  copy.id = "nyx-share-copy-link";
  copy.append(img(document, icon("link")), html(document, "span"));
  document.l10n.setAttributes(copy.lastChild, "nyx-share-copy");
  copy.disabled = !url;
  copy.addEventListener("click", () => {
    copyText(url);
    close();
  });
  const clean = html(document, "button", "nyx-share-copy");
  clean.id = "nyx-share-copy-clean";
  clean.append(img(document, icon("zap")), html(document, "span"));
  document.l10n.setAttributes(clean, "nyx-share-clean");
  document.l10n.setAttributes(clean.lastChild, "nyx-share-clean-label");
  clean.disabled = !url;
  clean.addEventListener("click", () => {
    copyText(cleanAddress(url));
    close();
  });
  buttons.append(copy, clean);
  text.append(buttons);
  card.append(thumb, text);
  return card;
}

/** An app as a square tile in its colour, with Share's word for why it can't now. */
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
  if (disabled && status) {
    button.append(html(document, "em", "nyx-share-why", status));
  }
  button.disabled = !!disabled;
  if (disabled && name) {
    button.title = status ? `${name}: ${status}` : name;
  }
  button.addEventListener("click", () => onPick(button));
  return button;
}

/** A device as a chip with its state: a dot, and what Share says of it. */
function device(document, destination, onPick) {
  const button = html(document, "button", "nyx-share-device");
  button.dataset.destination = destination.id;
  button.toggleAttribute("nyx-off", !destination.available);
  const avatar = html(document, "span", "nyx-share-avatar");
  avatar.append(img(document, icon(destination.icon)), html(document, "i"));
  const text = html(document, "span", "nyx-share-device-text");
  text.append(html(document, "b", null, destination.name), html(document, "small", null, destination.status || ""));
  button.append(avatar, text);
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
      const where = html(document, "p", "nyx-share-qr-address", url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""));
      const save = html(document, "button", "nyx-share-action nyx-share-primary");
      save.append(img(document, icon("download")), html(document, "span"));
      document.l10n.setAttributes(save.lastChild, "nyx-share-qr-save");
      save.disabled = true;
      body.append(head, box, caption, where, save);
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
      const tiles = html(document, "div", "nyx-share-tiles");
      const qr = tile(document, { l10nId: "nyx-share-qr-tile", iconName: "qr", color: "var(--nyx-swatch-violet, var(--nyx-accent))", disabled: !url, onPick: showQR });
      qr.id = "nyx-share-qr-tile";
      body.append(tiles);
      // Without Share, or until it answers, the QR code is all there is.
      if (error || !list) {
        tiles.append(qr);
        body.append(error ? note(document, null, error) : note(document, "nyx-share-looking"));
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
            status: d.available ? "" : d.status,
            onPick: button => pick(d, button),
          })
        );
      }
      tiles.append(qr);
      if (devices.length) {
        const header = document.createXULElement("label");
        header.className = "subview-subheader nyx-share-subheader";
        document.l10n.setAttributes(header, "nyx-share-devices");
        const row = html(document, "div", "nyx-share-devices");
        for (const d of devices) {
          const chip = device(document, d, pick);
          chip.disabled ||= !url;
          row.append(chip);
        }
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
