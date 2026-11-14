/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  UrlbarTestUtils: "resource://testing-common/UrlbarTestUtils.sys.mjs",
});

// Nyx: the address opens over the page in Focus, and in place in Studio and Workbench (address.js).
add_task(async function test_Floating_Urlbar() {
  for (const [layout, floating] of [["studio", false], ["focus", true]]) {
    await SpecialPowers.pushPrefEnv({ set: [["nyx.layout", layout]] });
    await TestUtils.waitForCondition(() => document.documentElement.getAttribute("nyx-layout") === layout);
    gURLBar.blur();

    await SimpleTest.promiseFocus(window);
    document.getElementById("Browser:OpenLocation").doCommand();
    await UrlbarTestUtils.promiseAutocompleteResultPopup({
      window,
      waitForFocus: SimpleTest.waitForFocus,
      value: "https://example.com/",
    });

    is(
      gURLBar.hasAttribute("zen-floating-urlbar"),
      floating,
      `The URL bar floats in ${layout} only if that layout floats it`
    );
    await UrlbarTestUtils.promisePopupClose(window, () => gURLBar.blur());
    await SpecialPowers.popPrefEnv();
  }
});

add_task(async function test_Click_Shoudnt_FLoat_Urlbar() {
  gURLBar.blur();

  await simulateClick(window);

  await UrlbarTestUtils.promiseAutocompleteResultPopup({
    window,
    waitForFocus: SimpleTest.waitForFocus,
    value: "https://example.com/",
  });

  ok(
    !gURLBar.hasAttribute("zen-floating-urlbar"),
    "URL bar should not be in floating mode"
  );
});

add_task(async function test_Floating_Highlight_Everything() {
  gURLBar.blur();

  await SimpleTest.promiseFocus(window);
  await selectWithMouseDrag(2, 5);
  document.getElementById("Browser:OpenLocation").doCommand();

  // Selection range
  Assert.equal(gURLBar.selectionStart, 0, "Selection start should be 0");
  Assert.equal(
    gURLBar.selectionEnd,
    gURLBar.value.length,
    "Selection end should be the length of the value"
  );
});
