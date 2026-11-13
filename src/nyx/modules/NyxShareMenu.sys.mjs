/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Share button's dropdown: where Nyx Share sends the page's address in one click, read from
// `nyx-browser-bridge share-destinations` and sent with `share-to` (share_menu.rs in the bridge).
// The full Share window is the last row.

import { findBridge } from "chrome://browser/content/nyx/NyxTheme.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserUtils: "resource://gre/modules/BrowserUtils.sys.mjs",
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
});

const VIEW_ID = "PanelUI-nyx-share";
const UNAVAILABLE = "Share isn't available.";

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

/** The last list, shown at once the next time while a fresh one is read. */
let known = null;

async function bridge(args) {
  const command = await findBridge();
  if (!command) {
    throw new Error(UNAVAILABLE);
  }
  const proc = await lazy.Subprocess.call({ command, arguments: args, stderr: "ignore" });
  let output = "";
  for (;;) {
    const chunk = await proc.stdout.readString();
    if (!chunk) {
      break;
    }
    output += chunk;
  }
  const { exitCode } = await proc.wait();
  let reply;
  try {
    reply = JSON.parse(output);
  } catch {
    throw new Error(UNAVAILABLE);
  }
  if (exitCode !== 0) {
    throw new Error(reply?.error || UNAVAILABLE);
  }
  return reply;
}

/** The selected tab's address, if it's a web page. */
function pageAddress(window) {
  const url = lazy.BrowserUtils.getShareableURL(window.gBrowser.currentURI);
  return url && (url.schemeIs("http") || url.schemeIs("https")) ? url.spec : null;
}

function line(document, l10nId, text) {
  const description = document.createXULElement("description");
  description.className = "nyx-share-note";
  if (l10nId) {
    document.l10n.setAttributes(description, l10nId);
  } else {
    description.textContent = text;
  }
  return description;
}

function row(document, destination, onPick) {
  const button = document.createXULElement("toolbarbutton");
  button.className = "subviewbutton subviewbutton-iconic nyx-share-destination";
  button.setAttribute("label", destination.name);
  button.setAttribute("image", `chrome://browser/content/nyx/icons/${ICONS[destination.icon] ?? "share"}.svg`);
  button.dataset.destination = destination.id;
  button.style.setProperty("--nyx-share-tint", destination.tint === "graphite" ? "var(--nyx-dim)" : `var(--nyx-swatch-${destination.tint}, var(--nyx-dim))`);
  if (destination.status) {
    button.setAttribute("nyx-status", destination.status);
  }
  if (!destination.available) {
    button.disabled = true;
    button.setAttribute("tooltiptext", `${destination.name} — ${destination.status || "unavailable"}`);
  }
  button.addEventListener("command", () => onPick(destination, button));
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
    view.setAttribute("mainview-with-header", "true");
    view.className = "PanelUI-subView";
    // Read now: from More tools the panel titles its header before a cached view is translated.
    const [{ attributes }] = new Localization(["browser/nyx-browser.ftl"], true).formatMessagesSync([{ id: "nyx-share-view" }]);
    const title = attributes.find(a => a.name === "title").value;
    view.setAttribute("title", title);
    // A panel's main view keeps a header it has but makes none (PanelMultiView's headerText).
    const header = document.createXULElement("box");
    header.className = "panel-header";
    const h1 = document.createElementNS("http://www.w3.org/1999/xhtml", "h1");
    const span = document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    span.textContent = title;
    h1.append(span);
    header.append(h1);
    view.append(header, document.createXULElement("toolbarseparator"));
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
    const fill = (list, error) => {
      body.replaceChildren();
      if (error) {
        body.append(line(document, null, error));
        return;
      }
      if (!list) {
        body.append(line(document, "nyx-share-looking"));
        return;
      }
      if (!list.length) {
        body.append(line(document, "nyx-share-nowhere"));
        return;
      }
      const apps = list.filter(d => d.section === "apps");
      const devices = list.filter(d => d.section !== "apps");
      body.append(...apps.map(d => row(document, d, pick)));
      if (devices.length) {
        const header = document.createXULElement("label");
        header.className = "subview-subheader";
        document.l10n.setAttributes(header, "nyx-share-devices");
        body.append(header, ...devices.map(d => row(document, d, pick)));
      }
    };
    const pick = async (destination, button) => {
      const url = pageAddress(window);
      if (!url) {
        return;
      }
      button.disabled = true;
      try {
        await bridge(["share-to", destination.id, url]);
        window.CustomizableUI.hidePanelForNode(view);
      } catch (error) {
        button.disabled = false;
        body.prepend(line(document, null, error.message));
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
