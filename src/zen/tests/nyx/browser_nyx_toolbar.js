/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const overflowed = () => [...document.querySelectorAll("[nyx-overflowed]")].map(node => node.id);

add_task(async function test_buttons_without_room_go_into_more_tools() {
  const urlbar = document.getElementById("urlbar-container");
  const more = () => document.getElementById("nyx-overflow-button");

  // Squeeze the address field below its usable width.
  urlbar.style.maxWidth = "60px";
  window.NyxToolbar.fit();
  await BrowserTestUtils.waitForCondition(() => overflowed().length > 0, "a button moved into More tools");
  ok(!more().hidden, "More tools shows");
  for (const id of overflowed()) {
    is(document.getElementById(id).getAttribute("cui-anchorid"), "nyx-overflow-button", `${id}'s panels anchor on More tools`);
  }
  for (const id of ["back-button", "forward-button", "stop-reload-button", "urlbar-container"]) {
    ok(!overflowed().includes(id), `${id} never moves`);
  }

  const popup = more().querySelector("menupopup");
  const shownPopup = BrowserTestUtils.waitForEvent(popup, "popupshown");
  more().open = true;
  await shownPopup;
  is(popup.children.length, overflowed().length, "the menu lists each moved button");
  popup.hidePopup();

  urlbar.style.maxWidth = "";
  window.NyxToolbar.fit();
  await BrowserTestUtils.waitForCondition(() => overflowed().length === 0, "they come back with room");
  ok(more().hidden, "More tools hides again");
});

add_task(async function test_icons_only_keeps_folder_names() {
  const parentGuid = PlacesUtils.bookmarks.toolbarGuid;
  const bookmark = await PlacesUtils.bookmarks.insert({ parentGuid, url: "https://example.com/", title: "Example" });
  const folder = await PlacesUtils.bookmarks.insert({ parentGuid, type: PlacesUtils.bookmarks.TYPE_FOLDER, title: "Trips" });
  const toolbar = document.getElementById("PersonalToolbar");
  setToolbarVisibility(toolbar, true, false, false);
  const item = guid => [...document.querySelectorAll("#PlacesToolbarItems > .bookmark-item")].find(n => n._placesNode?.bookmarkGuid === guid);
  await BrowserTestUtils.waitForCondition(() => item(bookmark.guid) && item(folder.guid), "the bookmarks are on the bar");
  const label = guid => getComputedStyle(item(guid).querySelector(".toolbarbutton-text")).display;

  isnot(label(bookmark.guid), "none", "names show by default");
  await SpecialPowers.pushPrefEnv({ set: [["nyx.bookmarks.icons-only", true]] });
  is(label(bookmark.guid), "none", "Icons only hides a bookmark's name");
  isnot(label(folder.guid), "none", "a folder keeps its name");
  await SpecialPowers.popPrefEnv();

  setToolbarVisibility(toolbar, false, false, false);
  await PlacesUtils.bookmarks.remove([bookmark, folder]);
});
