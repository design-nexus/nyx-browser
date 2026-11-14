/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Library's reading list: a bookmarks folder of its own, under Other bookmarks, found by the
// GUID Browser keeps in a pref, and made the first time a page is saved to it.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

const PREF = "nyx.library.reading-list";
const FIREFOX_BOOKMARKS_REMOVED = "nyx.library.firefox-bookmarks-removed";

export const NyxLibrary = {
  SECTIONS: ["history", "bookmarks", "downloads", "reading"],

  /** The reading list's folder, or null if there's none yet. */
  async readingList() {
    const guid = Services.prefs.getStringPref(PREF, "");
    if (!guid) {
      return null;
    }
    const folder = await lazy.PlacesUtils.bookmarks.fetch(guid);
    return folder?.type === lazy.PlacesUtils.bookmarks.TYPE_FOLDER ? folder : null;
  },

  async makeReadingList(title) {
    const existing = await this.readingList();
    if (existing) {
      return existing;
    }
    const folder = await lazy.PlacesUtils.bookmarks.insert({
      parentGuid: lazy.PlacesUtils.bookmarks.unfiledGuid,
      type: lazy.PlacesUtils.bookmarks.TYPE_FOLDER,
      title,
    });
    Services.prefs.setStringPref(PREF, folder.guid);
    return folder;
  },

  /**
   * Firefox's own bookmarks, a folder of mozilla.org links in the bookmarks menu that a profile
   * made before Browser has: removed once. A folder with anything else in it stays.
   */
  async removeFirefoxBookmarks() {
    if (Services.prefs.getBoolPref(FIREFOX_BOOKMARKS_REMOVED, false)) {
      return;
    }
    Services.prefs.setBoolPref(FIREFOX_BOOKMARKS_REMOVED, true);
    const menu = await lazy.PlacesUtils.promiseBookmarksTree(lazy.PlacesUtils.bookmarks.menuGuid);
    for (const folder of menu?.children ?? []) {
      const links = folder.children ?? [];
      if (
        folder.type === lazy.PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER &&
        links.length &&
        links.every(link => /^https:\/\/(support|www)\.mozilla\.org\//.test(link.uri ?? ""))
      ) {
        await lazy.PlacesUtils.bookmarks.remove(folder.guid);
      }
    }
  },

  /** Saves a page to the reading list, once. `folderTitle` names the folder if it's made now. */
  async saveToReadingList(url, title, folderTitle) {
    const folder = await this.makeReadingList(folderTitle);
    let present = false;
    await lazy.PlacesUtils.bookmarks.fetch({ url }, bookmark => {
      present ||= bookmark.parentGuid === folder.guid;
    });
    if (present) {
      return;
    }
    await lazy.PlacesUtils.bookmarks.insert({ parentGuid: folder.guid, url, title, index: 0 });
  },
};
