/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const orient = () => ({
  layout: document.documentElement.hasAttribute("nyx-tabs-horizontal"),
  strip: gBrowser.tabContainer.getAttribute("orient"),
  space: gZenWorkspaces.activeScrollbox?.getAttribute("orient"),
});

const shown = () => document.documentElement.getAttribute("nyx-layout");
const parentOf = id => document.getElementById(id)?.parentElement?.id;

async function useLayout(layout, more = []) {
  await SpecialPowers.pushPrefEnv({ set: [["nyx.layout", layout], ["nyx.sidebar.mode", "expanded"], ...more] });
  await TestUtils.waitForCondition(() => shown() === layout, `the window shows ${layout}`);
  // layout.js arranges the window a frame after Zen does.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

add_task(async function test_layouts_are_zens_prefs() {
  for (const [layout, vertical, single] of [["studio", true, false], ["focus", true, true], ["workbench", false, false]]) {
    await useLayout(layout);
    is(Services.prefs.getBoolPref("zen.tabs.vertical"), vertical, `${layout}: tabs vertical is ${vertical}`);
    is(Services.prefs.getBoolPref("zen.view.use-single-toolbar"), single, `${layout}: single toolbar is ${single}`);
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_zens_prefs_choose_the_layout() {
  await SpecialPowers.pushPrefEnv({ set: [["zen.tabs.vertical", false]] });
  await TestUtils.waitForCondition(() => Services.prefs.getStringPref("nyx.layout") === "workbench", "tabs in a row are Workbench");
  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(() => Services.prefs.getStringPref("nyx.layout") === "studio", "tabs in a column again are Studio");
  await SpecialPowers.pushPrefEnv({ set: [["zen.view.use-single-toolbar", true]] });
  await TestUtils.waitForCondition(() => Services.prefs.getStringPref("nyx.layout") === "focus", "Zen's single toolbar is Focus");
  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(() => Services.prefs.getStringPref("nyx.layout") === "studio", "and back");
});

add_task(async function test_studio_centres_the_address() {
  await useLayout("studio");
  ok(document.getElementById("back-button").closest("#zen-sidebar-top-buttons"), "back sits over the sidebar");
  is(parentOf("forward-button"), parentOf("back-button"), "forward beside it");
  const bar = document.getElementById("nav-bar").getBoundingClientRect();
  const address = document.getElementById("urlbar-container").getBoundingClientRect();
  ok(address.width <= 601, "the address is at most 600 wide");
  ok(Math.abs(address.x + address.width / 2 - (bar.x + bar.width / 2)) < 160, "and in the header's middle");
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_focus_keeps_everything_in_the_sidebar() {
  const parentGuid = PlacesUtils.bookmarks.toolbarGuid;
  const bookmark = await PlacesUtils.bookmarks.insert({ parentGuid, url: "https://example.com/", title: "Example" });
  await useLayout("focus", [["browser.toolbars.bookmarks.visibility", "always"]]);
  ok(document.getElementById("urlbar-container").closest("#navigator-toolbox"), "the address is in the sidebar");
  for (const id of ["downloads-button", "unified-extensions-button", "PanelUI-button"]) {
    ok(document.getElementById(id).closest("#zen-sidebar-foot-buttons"), `${id} is in the sidebar's foot`);
  }
  ok(document.getElementById("PersonalToolbar").closest("#navigator-toolbox"), "bookmarks are a shelf in the sidebar");
  ok(document.getElementById("nyx-shelf-head"), "under a heading");

  await SpecialPowers.pushPrefEnv({ set: [["nyx.sidebar.mode", "compact"]] });
  await TestUtils.waitForCondition(() => document.documentElement.getAttribute("nyx-sidebar") === "expanded", "Focus is never compact");
  ok(document.documentElement.hasAttribute("zen-single-toolbar"), "so the address stays in the sidebar");
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();

  await useLayout("studio", [["browser.toolbars.bookmarks.visibility", "always"]]);
  is(parentOf("PersonalToolbar"), "zen-appcontent-navbar-container", "the bar is under the header again");
  ok(!document.getElementById("nyx-shelf-head"), "without the shelf's heading");
  ok(document.getElementById("downloads-button").closest("#nav-bar"), "Downloads is back in the top bar");
  await SpecialPowers.popPrefEnv();
  await PlacesUtils.bookmarks.remove(bookmark);
});

add_task(async function test_workbench_has_the_rail() {
  await useLayout("workbench");
  const rail = document.getElementById("nyx-rail");
  ok(rail && !rail.hidden, "the rail is there");
  is(rail.parentElement.id, "zen-tabbox-wrapper", "beside the page");
  is(rail.querySelectorAll(".nyx-rail-space").length, gZenWorkspaces.getWorkspaces().length, "a button for each workspace");
  ok(rail.querySelector(".nyx-rail-space[selected]"), "the current one is chosen");
  is(gZenWorkspaces.workspaceMenuAnchor?.id, "nyx-rail-switcher", "the workspaces menu opens from the rail");
  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(() => rail.hidden, "the rail goes with Workbench");
});

add_task(async function test_switching_keeps_the_tabs() {
  const tabs = [
    BrowserTestUtils.addTab(gBrowser, "about:blank"),
    BrowserTestUtils.addTab(gBrowser, "about:blank"),
  ];
  gBrowser.pinTab(tabs[0]);
  gBrowser.selectedTab = tabs[1];
  const count = gBrowser.tabs.length;

  await useLayout("workbench");
  await TestUtils.waitForCondition(() => orient().strip === "horizontal", "the strip lies in a row");
  Assert.deepEqual(orient(), { layout: true, strip: "horizontal", space: "horizontal" }, "tabs, workspace and layout are a row");
  is(document.getElementById("titlebar").nextElementSibling?.id, "nav-bar", "the row lies above the top bar");
  is(gBrowser.tabs.length, count, "no tab opened or closed");
  is(gBrowser.selectedTab, tabs[1], "the same tab is selected");
  ok(tabs[0].pinned, "the pinned tab is still pinned");

  await SpecialPowers.popPrefEnv();
  await useLayout("focus");
  await TestUtils.waitForCondition(() => orient().strip === "vertical", "the strip is a column again");
  Assert.deepEqual(orient(), { layout: false, strip: "vertical", space: "vertical" }, "back to a column");
  is(document.getElementById("titlebar").parentElement, gNavToolbox, "the column is the sidebar's again");
  is(gBrowser.tabs.length, count, "no tab opened or closed");
  await SpecialPowers.popPrefEnv();

  gBrowser.unpinTab(tabs[0]);
  for (const tab of tabs) {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_a_row_drops_by_x() {
  await useLayout("workbench");
  const dnd = gBrowser.tabContainer.tabDragAndDrop;
  const rect = { left: 100, width: 200, top: 0, height: 30 };
  ok(dnd._tabsInRow, "drag and drop knows tabs are in a row");
  ok(dnd._dropsBefore({ clientX: 120, clientY: 29 }, rect), "the near half drops before");
  ok(!dnd._dropsBefore({ clientX: 280, clientY: 1 }, rect), "the far half drops after");
  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(() => !dnd._tabsInRow, "a column again");
  ok(dnd._dropsBefore({ clientX: 280, clientY: 1 }, rect), "a column drops by height");
});
