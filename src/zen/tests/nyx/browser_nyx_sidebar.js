/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const shown = () => document.documentElement.getAttribute("nyx-sidebar");

add_task(async function test_manual_modes_apply_to_this_window() {
  const globalExpanded = Services.prefs.getBoolPref("zen.view.sidebar-expanded");
  for (const mode of ["compact", "expanded", "hidden"]) {
    await SpecialPowers.pushPrefEnv({ set: [["nyx.sidebar.mode", mode]] });
    await BrowserTestUtils.waitForCondition(() => shown() === mode, `the sidebar is ${mode}`);
    is(gZenCompactModeManager.preference, mode === "hidden", `compact mode matches ${mode}`);
    if (mode !== "hidden") {
      is(gZenVerticalTabsManager._prefsSidebarExpanded, mode === "expanded", `${mode} sets this window's sidebar`);
    }
    await SpecialPowers.popPrefEnv();
  }
  is(Services.prefs.getBoolPref("zen.view.sidebar-expanded"), globalExpanded, "Zen's shared pref wasn't touched");
});

add_task(async function test_automatic_follows_the_width() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["nyx.sidebar.mode", "auto"],
      ["nyx.sidebar.auto.expanded-from", 3000],
      ["nyx.sidebar.auto.compact-from", 10],
    ],
  });
  await BrowserTestUtils.waitForCondition(() => shown() === "compact", "narrower than expanded-from is compact");
  await SpecialPowers.pushPrefEnv({ set: [["nyx.sidebar.auto.expanded-from", 20]] });
  await BrowserTestUtils.waitForCondition(() => shown() === "expanded", "wider than expanded-from is expanded");
  await SpecialPowers.popPrefEnv();
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_the_button_steps_through_modes() {
  await SpecialPowers.pushPrefEnv({ set: [["nyx.sidebar.mode", "expanded"]] });
  await BrowserTestUtils.waitForCondition(() => shown() === "expanded");
  window.NyxSidebar.toggle();
  is(Services.prefs.getStringPref("nyx.sidebar.mode"), "compact", "expanded steps to compact");
  gZenVerticalTabsManager.toggleExpand();
  is(Services.prefs.getStringPref("nyx.sidebar.mode"), "expanded", "Zen's own toggle goes through Browser's modes");
  await SpecialPowers.popPrefEnv();
});
