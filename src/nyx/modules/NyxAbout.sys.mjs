/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser's own about: pages, registered once for the app by the first window (NyxPreloaded.js):
// about:library is Browser's Library and about:extensions its Extensions page, which Firefox's
// about:addons is too. Firefox's
// about:downloads is the Library's Downloads and about:firefoxview its History; about:logins leads
// to Settings › Passwords (page.js); about:credits is Browser's contributors. Browser's pages load
// in Browser's own process, as about:preferences does; the credits, a website, in a web page's.

const LIBRARY = "chrome://browser/content/nyx/library/library.html";
const CHROME = Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.IS_SECURE_CHROME_UI;
const WEB = Ci.nsIAboutModule.URI_SAFE_FOR_UNTRUSTED_CONTENT | Ci.nsIAboutModule.URI_MUST_LOAD_IN_CHILD;
const PAGES = {
  library: [LIBRARY, CHROME],
  downloads: [LIBRARY, CHROME],
  firefoxview: [LIBRARY, CHROME],
  logins: [LIBRARY, CHROME],
  extensions: ["chrome://browser/content/nyx/library/extensions.html", CHROME],
  addons: ["chrome://browser/content/nyx/library/extensions.html", CHROME],
  credits: ["https://github.com/design-nexus/nyx-browser/graphs/contributors", WEB],
};

let registered = false;

class AboutPage {
  QueryInterface = ChromeUtils.generateQI(["nsIAboutModule"]);

  constructor(url, flags) {
    this.url = url;
    this.flags = flags;
  }

  newChannel(uri, loadInfo) {
    const channel = Services.io.newChannelFromURIWithLoadInfo(Services.io.newURI(this.url), loadInfo);
    channel.originalURI = uri;
    return channel;
  }

  getURIFlags() {
    return this.flags;
  }

  getChromeURI() {
    return Services.io.newURI(this.url);
  }
}

export const NyxAbout = {
  PAGES,

  register() {
    if (registered) {
      return;
    }
    registered = true;
    const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    for (const [name, [url, flags]] of Object.entries(PAGES)) {
      const page = new AboutPage(url, flags);
      registrar.registerFactory(
        Services.uuid.generateUUID(),
        `about:${name}`,
        `@mozilla.org/network/protocol/about;1?what=${name}`,
        {
          createInstance(iid) {
            return page.QueryInterface(iid);
          },
        }
      );
    }
  },
};
