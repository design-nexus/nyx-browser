/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const orient = () => ({
  layout: document.documentElement.hasAttribute("nyx-tabs-horizontal"),
  strip: gBrowser.tabContainer.getAttribute("orient"),
  space: gZenWorkspaces.activeScrollbox?.getAttribute("orient"),
});

add_task(async function test_switching_keeps_the_tabs() {
  const tabs = [
    BrowserTestUtils.addTab(gBrowser, "about:blank"),
    BrowserTestUtils.addTab(gBrowser, "about:blank"),
  ];
  gBrowser.pinTab(tabs[0]);
  gBrowser.selectedTab = tabs[1];
  const count = gBrowser.tabs.length;

  await SpecialPowers.pushPrefEnv({ set: [["zen.tabs.vertical", false]] });
  await TestUtils.waitForCondition(() => orient().strip === "horizontal", "the strip lies in a row");
  Assert.deepEqual(orient(), { layout: true, strip: "horizontal", space: "horizontal" }, "tabs, workspace and layout are a row");
  is(document.getElementById("titlebar").nextElementSibling?.id, "nav-bar", "the row lies above the top bar");
  is(gBrowser.tabs.length, count, "no tab opened or closed");
  is(gBrowser.selectedTab, tabs[1], "the same tab is selected");
  ok(tabs[0].pinned, "the pinned tab is still pinned");

  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(() => orient().strip === "vertical", "the strip is a column again");
  Assert.deepEqual(orient(), { layout: false, strip: "vertical", space: "vertical" }, "back to a column");
  is(document.getElementById("titlebar").parentElement, gNavToolbox, "the column is the sidebar's again");
  is(gBrowser.tabs.length, count, "no tab opened or closed");

  gBrowser.unpinTab(tabs[0]);
  for (const tab of tabs) {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_a_row_drops_by_x() {
  await SpecialPowers.pushPrefEnv({ set: [["zen.tabs.vertical", false]] });
  const dnd = gBrowser.tabContainer.tabDragAndDrop;
  const rect = { left: 100, width: 200, top: 0, height: 30 };
  ok(dnd._tabsInRow, "drag and drop knows tabs are in a row");
  ok(dnd._dropsBefore({ clientX: 120, clientY: 29 }, rect), "the near half drops before");
  ok(!dnd._dropsBefore({ clientX: 280, clientY: 1 }, rect), "the far half drops after");
  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(() => !dnd._tabsInRow, "a column again");
  ok(dnd._dropsBefore({ clientX: 280, clientY: 1 }, rect), "a column drops by height");
});
