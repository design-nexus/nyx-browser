/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The address field's QR button (navigator-toolbox.inc.xhtml), Firefox's own QR dialog for the
 * page in this tab, and the Share and Capture buttons, which follow the page. The QR button shows
 * and Share is usable only on a page that can be sent, a web page by Firefox's own rule for
 * sharing. Capture is usable on any page but Firefox's own and other extensions', which Firefox
 * gives an extension only blurred. */
{
  const { BrowserUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/BrowserUtils.sys.mjs"
  );
  const SHARE = "nyx-share-button";
  const CAPTURE = "nyx-capture-button";
  const OWN_EXTENSION = "nyx-integration@design-nexus.github.io";

  const show = button => {
    const { SharingUtils } = ChromeUtils.importESModule(
      "moz-src:///browser/components/sharing/SharingUtils.sys.mjs"
    );
    button.contextBrowserToShare = Cu.getWeakReference(gBrowser.selectedBrowser);
    SharingUtils.showQRCode(button);
  };

  const qr = document.getElementById("nyx-qr-button");
  qr?.addEventListener("click", event => {
    if (event.button === 0) {
      event.stopPropagation();
      show(qr);
    }
  });
  qr?.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      show(qr);
    }
  });

  /** Whether the selected tab's page can be sent: Share sends web pages only. */
  function shareable() {
    const url = BrowserUtils.getShareableURL(gBrowser.currentURI);
    return !!url && (url.schemeIs("http") || url.schemeIs("https"));
  }

  /** Whether a capture of the selected tab's page comes out whole (see ext-tabs-base.js). */
  function capturable() {
    const principal = gBrowser.selectedBrowser.contentPrincipal;
    return (
      !!principal &&
      !principal.isSystemPrincipal &&
      (!principal.addonId || principal.addonId === OWN_EXTENSION)
    );
  }

  /** A button that can be in the bar, in More tools, or removed. */
  function follow(id, usable) {
    const button = document.getElementById(id);
    if (button) {
      button.disabled = !usable;
      document.l10n.setAttributes(button, usable ? id : `${id}-unavailable`);
    }
  }

  function update() {
    const canShare = shareable();
    if (qr) {
      qr.hidden = !canShare;
    }
    follow(SHARE, canShare);
    follow(CAPTURE, capturable());
  }

  gBrowser.addProgressListener({
    onLocationChange(webProgress) {
      if (webProgress.isTopLevel) {
        update();
      }
    },
  });
  const widgets = {
    onWidgetAfterDOMChange(node) {
      if ((node.id === SHARE || node.id === CAPTURE) && node.ownerDocument === document) {
        update();
      }
    },
  };
  CustomizableUI.addListener(widgets);
  window.addEventListener("unload", () => CustomizableUI.removeListener(widgets), { once: true });
  update();
}
