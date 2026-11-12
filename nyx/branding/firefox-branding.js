/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Replaces the file surfer generates for the nyx brand, which points at Zen's website.

pref("startup.homepage_override_url", "");
pref("startup.homepage_welcome_url", "");
pref("startup.homepage_welcome_url.additional", "");

pref("app.update.url.manual", "https://github.com/design-nexus/nyx-browser/releases");
pref("app.update.url.details", "https://github.com/design-nexus/nyx-browser/releases");
pref("app.releaseNotesURL", "https://github.com/design-nexus/nyx-browser/releases");
pref("app.releaseNotesURL.aboutDialog", "https://github.com/design-nexus/nyx-browser/releases");
pref("app.releaseNotesURL.prompt", "https://github.com/design-nexus/nyx-browser/releases");

// Number of usages of the web console.
// If this is less than 5, then pasting code into the web console is disabled
pref("devtools.selfxss.count", 5);
