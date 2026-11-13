/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const overflowList = () => [...document.getElementById("widget-overflow-list").children].map(node => node.id);

add_task(async function test_buttons_without_room_go_into_more_tools() {
  const navBar = document.getElementById("nav-bar");
  const more = document.getElementById("nav-bar-overflow-button");

  // A narrow window: Firefox's own overflow moves the last actions into More tools.
  const { outerWidth, outerHeight } = window;
  window.resizeTo(800, outerHeight);
  await TestUtils.waitForCondition(() => navBar.hasAttribute("overflowing"), "the top bar overflows");
  ok(overflowList().length, "a button moved into More tools");
  ok(more.getBoundingClientRect().width > 0, "More tools shows");
  for (const id of ["back-button", "forward-button", "stop-reload-button", "urlbar-container"]) {
    ok(!overflowList().includes(id), `${id} never moves`);
  }
  for (const id of ["nyx-settings-button", "PanelUI-button"]) {
    ok(document.getElementById(id).getBoundingClientRect().width > 0, `${id} stays in the row`);
  }
  ok(
    more.getBoundingClientRect().left < document.getElementById("nyx-settings-button").getBoundingClientRect().left,
    "More tools comes before Settings and the menu"
  );
  const placed = CustomizableUI.getWidgetIdsInArea("nav-bar").filter(id => overflowList().includes(id));
  Assert.deepEqual(overflowList(), placed, "More tools keeps the top bar's order");
  is(
    navBar.getAttribute("addon-webext-overflowtarget"),
    "widget-overflow-list",
    "extensions' buttons go into More tools too"
  );

  window.resizeTo(outerWidth, outerHeight);
  await TestUtils.waitForCondition(() => !navBar.hasAttribute("overflowing"), "they come back with room");
});

add_task(async function test_icons_only_keeps_folder_names() {
  const parentGuid = PlacesUtils.bookmarks.toolbarGuid;
  const bookmark = await PlacesUtils.bookmarks.insert({ parentGuid, url: "https://example.com/", title: "Example" });
  const folder = await PlacesUtils.bookmarks.insert({ parentGuid, type: PlacesUtils.bookmarks.TYPE_FOLDER, title: "Trips" });
  const toolbar = document.getElementById("PersonalToolbar");
  setToolbarVisibility(toolbar, true, false, false);
  const item = guid => [...document.querySelectorAll("#PlacesToolbarItems > .bookmark-item")].find(n => n._placesNode?.bookmarkGuid === guid);
  await TestUtils.waitForCondition(() => item(bookmark.guid) && item(folder.guid), "the bookmarks are on the bar");
  const label = guid => getComputedStyle(item(guid).querySelector(".toolbarbutton-text")).display;

  isnot(label(bookmark.guid), "none", "names show by default");
  await SpecialPowers.pushPrefEnv({ set: [["nyx.bookmarks.icons-only", true]] });
  await TestUtils.waitForCondition(() => label(bookmark.guid) === "none", "Icons only hides a bookmark's name");
  isnot(label(folder.guid), "none", "a folder keeps its name");
  await SpecialPowers.popPrefEnv();

  setToolbarVisibility(toolbar, false, false, false);
  await PlacesUtils.bookmarks.remove([bookmark, folder]);
});
