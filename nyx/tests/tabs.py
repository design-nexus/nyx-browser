#!/usr/bin/env python3
"""Tab behavior in both orientations, against a private headless browser.

    tests/tabs.py [--shots DIR] [--only NAME]

Drags go through Zen's real dragstart/dragover/drop handlers with synthesized events, so
they exercise its drop logic, not the operating system's drag session.
"""

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from marionette import Browser, ScriptError  # noqa: E402

HELPERS = r"""
const P = Services.scriptSecurityManager.getSystemPrincipal();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const url = name => `data:text/html,<title>${name}</title>${name}`;
const open = name => gBrowser.addTab(url(name), { triggeringPrincipal: P, skipAnimation: true, inBackground: true });
const box = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
const normal = () => gBrowser.visibleTabs.filter(t => !t.pinned && !t.hasAttribute("zen-empty-tab") && !t.group && t.label !== "Base");
const names = list => list.map(t => t.label);
/** Waits for a scroll animation to end, then returns where the element came to rest. */
const settled = async e => {
  let last = null;
  for (let i = 0; i < 40; i++) {
    const now = box(e);
    if (last && now.x === last.x && now.y === last.y) return now;
    last = now;
    await sleep(150);
  }
  return last;
};
/** Leaves only a selected tab named Base, which `normal` ignores, so each test starts clean. */
const closeNormal = async () => {
  const base = gBrowser.addTab(url("Base"), { triggeringPrincipal: P, skipAnimation: true });
  gBrowser.selectedTab = base;
  await sleep(250);
  for (const t of [...gBrowser.visibleTabs]) if (t !== base && !t.pinned && !t.hasAttribute("zen-empty-tab")) gBrowser.removeTab(t, { animate: false });
  await sleep(150);
};

function fire(type, target, x, y, dt) {
  const ev = new DragEvent(type, {
    bubbles: true, cancelable: true, view: window, clientX: x, clientY: y,
    screenX: window.mozInnerScreenX + x, screenY: window.mozInnerScreenY + y, dataTransfer: dt,
  });
  target.dispatchEvent(ev);
  return ev;
}

/** Drags `from` across `to`, ending past its middle on the far side of the row or column. */
async function drag(from, to, before) {
  const vertical = gBrowser.tabContainer.verticalMode;
  const dt = new DataTransfer();
  const a = box(from), b = box(to);
  const sx = a.x + a.w / 2, sy = a.y + a.h / 2;
  const ex = vertical ? b.x + b.w / 2 : b.x + b.w * (before ? 0.15 : 0.85);
  const ey = vertical ? b.y + b.h * (before ? 0.15 : 0.85) : b.y + b.h / 2;
  fire("dragstart", from, sx, sy, dt);
  // A real drag session supplies these; without them handle_drop skips its "move" branch.
  dt.effectAllowed = "move";
  dt.dropEffect = "move";
  await sleep(50);
  for (let i = 1; i <= 8; i++) {
    const x = sx + ((ex - sx) * i) / 8, y = sy + ((ey - sy) * i) / 8;
    const over = document.elementFromPoint(x, y) || to;
    fire("dragover", over, x, y, dt);
    dt.dropEffect = "move";
    await sleep(40);
  }
  const indicator = gZenPinnedTabManager._dragIndicator;
  const mark = indicator ? { orientation: indicator.getAttribute("orientation"), ...box(indicator) } : null;
  fire("drop", document.elementFromPoint(ex, ey) || to, ex, ey, dt);
  fire("dragend", from, ex, ey, dt);
  await sleep(500);
  return mark;
}
"""


class Failed(Exception):
    pass


def check(condition, message, detail=None):
    if not condition:
        raise Failed(message + (f": {json.dumps(detail)}" if detail is not None else ""))


def run(b, body, *args, timeout=30):
    """Run an async function body with the helpers in scope. `args` is available to it."""
    script = (
        HELPERS
        + "\nconst args = Array.from(arguments); const done = args.pop();\n(async () => {"
        + body
        + "})().then(v => done({ ok: v === undefined ? null : v }), e => done({ error: String(e) + '\\n' + (e.stack || '') }));"
    )
    result = b.js_async(script, *args, timeout=timeout)
    if "error" in result:
        raise Failed(result["error"])
    return result["ok"]


def set_orientation(b, horizontal):
    run(b, "Services.prefs.setBoolPref('zen.tabs.vertical', !args[0]); await sleep(800);", horizontal)


def in_line(b, tabs, horizontal):
    """Tabs lie in one row left to right (or one column top to bottom), without overlap."""
    if horizontal:
        check(len({round(t["y"]) for t in tabs}) == 1, "tabs aren't in one row", tabs)
        for a, c in zip(tabs, tabs[1:]):
            check(c["x"] >= a["x"] + a["w"] - 1, "tabs overlap or are out of order", [a, c])
    else:
        check(len({round(t["x"]) for t in tabs}) == 1, "tabs aren't in one column", tabs)
        for a, c in zip(tabs, tabs[1:]):
            check(c["y"] >= a["y"] + a["h"] - 1, "tabs overlap or are out of order", [a, c])


def layout(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["One", "Two", "Three", "Four"]) open(n);
        await sleep(600);
        const list = normal();
        return { tabs: list.map(box), names: names(list), win: [innerWidth, innerHeight], orient: gBrowser.tabContainer.getAttribute("orient"),
                 page: box(document.getElementById("tabbrowser-tabbox")), strip: box(document.getElementById("tabbrowser-tabs")),
                 bar: box(document.getElementById("nav-bar")) };
        """,
    )
    check(d["orient"] == ("horizontal" if horizontal else "vertical"), "wrong orient", d["orient"])
    check(len(d["tabs"]) >= 4, "tabs missing", d["names"])
    in_line(b, d["tabs"], horizontal)
    for t in d["tabs"]:
        check(t["w"] > 40 and t["h"] > 20, "tab too small", t)
        check(0 <= t["x"] and t["x"] + t["w"] <= d["win"][0], "tab off screen", t)
    if horizontal:
        check(d["strip"]["y"] + d["strip"]["h"] <= d["bar"]["y"] + 1, "the tabs aren't above the address bar, as Firefox has them", d)
        check(d["bar"]["y"] + d["bar"]["h"] <= d["page"]["y"] + 1, "the top bar overlaps the page", d)
        check(d["page"]["w"] > d["win"][0] - 40, "the page doesn't span the window", d["page"])
    else:
        check(d["page"]["x"] >= d["strip"]["x"] + d["strip"]["w"] - 1, "the sidebar overlaps the page", d)


def drag_reorder(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["A", "B", "C", "D"]) open(n);
        await sleep(600);
        const by = n => normal().find(t => t.label === n);
        const before = names(normal());
        const first = before[0], last = before.at(-1), second = before[1];
        const mark = await drag(by(first), by(last), false);
        const afterForward = names(normal());
        await drag(by(afterForward.at(-1)), by(afterForward[0]), true);
        const afterBack = names(normal());
        return { before, first, afterForward, afterBack, mark };
        """,
    )
    check(d["afterForward"][-1] == d["first"], "dragging forward didn't move the tab to the end", d)
    check(d["afterBack"][0] == d["first"], "dragging back didn't move the tab to the start", d)
    check(sorted(d["afterBack"]) == sorted(d["before"]), "a drag lost or added tabs", d)
    if horizontal:
        check(d["mark"] and d["mark"]["orientation"] == "vertical", "the drop marker lies the wrong way", d["mark"])


def drop_side(b, horizontal):
    """A drop on the near half of a tab lands before it; the far half lands after it."""
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["A", "B", "C", "D", "E"]) open(n);
        await sleep(600);
        const by = n => normal().find(t => t.label === n);
        const list = names(normal());
        await drag(by(list[0]), by(list[2]), true);
        const landedBefore = names(normal());
        const l2 = names(normal());
        await drag(by(l2.at(-1)), by(l2[1]), false);
        return { list, landedBefore, target: list[2], moved: list[0], last: l2.at(-1), after: l2[1], final: names(normal()) };
        """,
    )
    lb = d["landedBefore"]
    check(lb.index(d["moved"]) == lb.index(d["target"]) - 1, "drop before landed on the wrong side", d)
    f = d["final"]
    check(f.index(d["last"]) == f.index(d["after"]) + 1, "drop after landed on the wrong side", d)


def pinned(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["P1", "P2", "N1", "N2"]) open(n);
        await sleep(400);
        const by = n => gBrowser.visibleTabs.find(t => t.label === n);
        gBrowser.pinTab(by("P1"));
        gBrowser.pinTab(by("P2"));
        await sleep(600);
        const pins = gBrowser.visibleTabs.filter(t => t.pinned && !t.hasAttribute("zen-essential") && !t.hasAttribute("zen-empty-tab"));
        const pinBoxes = pins.map(box), rest = normal().map(box);
        const order = names(pins);
        await drag(pins[0], pins.at(-1), false);
        const orderAfter = names(gBrowser.visibleTabs.filter(t => t.pinned && !t.hasAttribute("zen-essential")));
        gBrowser.unpinTab(by("P1"));
        gBrowser.unpinTab(by("P2"));
        await sleep(500);
        return { pinBoxes, rest, order, orderAfter, stillPinned: gBrowser.visibleTabs.filter(t => t.pinned && !t.hasAttribute("zen-essential")).length };
        """,
    )
    check(len(d["pinBoxes"]) == 2, "pinned tabs missing", d)
    in_line(b, d["pinBoxes"], horizontal)
    if horizontal:
        check(d["pinBoxes"][-1]["x"] + d["pinBoxes"][-1]["w"] <= d["rest"][0]["x"] + 1, "pinned tabs aren't first", d)
    else:
        check(d["pinBoxes"][-1]["y"] + d["pinBoxes"][-1]["h"] <= d["rest"][0]["y"] + 1, "pinned tabs aren't first", d)
    check(d["orderAfter"] == list(reversed(d["order"])), "pinned tabs didn't reorder", d)
    check(d["stillPinned"] == 0, "unpinning failed", d)


def folders(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["F1", "F2", "F3"]) open(n);
        await sleep(400);
        const by = n => gBrowser.visibleTabs.find(t => t.label === n);
        const inside = [by("F1"), by("F2")];
        for (const t of inside) gBrowser.pinTab(t);
        await sleep(300);
        const folder = await gZenFolders.createFolder(inside, { label: "Trip", renameFolder: false, workspaceId: gZenWorkspaces.activeWorkspace });
        await sleep(700);
        const open_ = { folder: box(folder.labelElement), tabs: inside.map(box), inFolder: inside.every(t => t.group === folder) };
        folder.collapsed = true;
        await sleep(700);
        const closed = { visible: inside.filter(t => t.getBoundingClientRect().width > 0 && !t.closest("[collapsed]")).length };
        folder.collapsed = false;
        await sleep(500);
        const reopened = inside.map(box);
        await gZenFolders.delete?.(folder);
        return { open: open_, closed, reopened, id: folder.id };
        """,
    )
    check(d["open"]["inFolder"], "tabs didn't join the folder", d)
    check(d["open"]["folder"]["w"] > 0 and d["open"]["folder"]["h"] > 0, "the folder has no label", d)
    in_line(b, d["open"]["tabs"], horizontal)
    check(d["closed"]["visible"] == 0, "collapsing the folder didn't hide its tabs", d)
    check(all(t["w"] > 0 for t in d["reopened"]), "reopening the folder didn't show its tabs", d)


def workspaces(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        open("Home tab");
        await sleep(400);
        const first = gZenWorkspaces.activeWorkspace;
        const created = await gZenWorkspaces.createAndSaveWorkspace("Second", undefined, false, 0);
        await sleep(800);
        await gZenWorkspaces.changeWorkspaceWithID(created.uuid);
        await sleep(1000);
        open("Second tab one");
        open("Second tab two");
        await sleep(600);
        const inSecond = names(normal());
        const boxes = normal().map(box);
        const orients = [...document.querySelectorAll(".workspace-arrowscrollbox")].map(e => e.getAttribute("orient"));
        await gZenWorkspaces.changeWorkspaceWithID(first);
        await sleep(1000);
        const backHome = names(normal());
        const homeBoxes = normal().map(box);
        await gZenWorkspaces.changeWorkspaceWithID(created.uuid);
        await sleep(700);
        const returned = names(normal());
        await gZenWorkspaces.changeWorkspaceWithID(first);
        await sleep(600);
        await gZenWorkspaces.removeWorkspace(created.uuid);
        await sleep(600);
        return { inSecond, boxes, orients, backHome, homeBoxes, returned, count: gZenWorkspaces.getWorkspaces().length };
        """,
        timeout=60,
    )
    check({"Second tab one", "Second tab two"} <= set(d["inSecond"]), "tabs didn't open in the new workspace", d)
    check("Home tab" not in d["inSecond"], "the first workspace's tab shows in the second", d)
    check("Home tab" in d["backHome"] and "Second tab one" not in d["backHome"], "switching back shows the wrong tabs", d)
    check({"Second tab one", "Second tab two"} <= set(d["returned"]), "the second workspace lost its tabs", d)
    want = "horizontal" if horizontal else "vertical"
    check(all(o == want for o in d["orients"]), "a workspace has the wrong orientation", d["orients"])
    in_line(b, d["boxes"], horizontal)
    in_line(b, d["homeBoxes"], horizontal)
    check(d["count"] == 1, "removing the workspace failed", d)


def split_view(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["L", "R", "Other"]) open(n);
        await sleep(400);
        const by = n => gBrowser.visibleTabs.find(t => t.label === n);
        const pair = [by("L"), by("R")];
        gBrowser.selectedTab = pair[0];
        await sleep(300);
        gZenViewSplitter.splitTabs(pair);
        await sleep(1200);
        const panels = pair.map(t => box(t.linkedBrowser.closest(".browserSidebarContainer")));
        const inGroup = pair.every(t => t.group?.hasAttribute("split-view-group"));
        const page = box(document.getElementById("tabbrowser-tabbox"));
        const rowBoxes = pair.map(box);
        const groupBox = box(pair[0].group);
        gBrowser.selectedTab = by("Other");
        await sleep(600);
        const otherPanel = box(by("Other").linkedBrowser.closest(".browserSidebarContainer"));
        gBrowser.selectedTab = pair[0];
        await sleep(600);
        const backPanels = pair.map(t => box(t.linkedBrowser.closest(".browserSidebarContainer")));
        gZenViewSplitter.removeTabFromGroup?.(pair[1]) ;
        gZenViewSplitter.unsplitCurrentView?.();
        await sleep(800);
        return { panels, inGroup, page, rowBoxes, groupBox, otherPanel, backPanels, grouped: pair.map(t => !!t.group) };
        """,
        timeout=40,
    )
    a, c = d["panels"]
    check(d["inGroup"], "tabs didn't form a split group", d)
    check(a["w"] > 100 and c["w"] > 100 and c["x"] >= a["x"] + a["w"] - 8, "panes aren't side by side", d)
    check(d["otherPanel"]["w"] > d["page"]["w"] * 0.8, "another tab doesn't fill the page", d)
    x, y = d["backPanels"]
    check(y["x"] >= x["x"] + x["w"] - 8, "returning to the split lost it", d)
    check(d["groupBox"]["w"] > 0 and d["groupBox"]["h"] > 0, "the split group has no place in the tab strip", d)


def overflow(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (let i = 0; i < 30; i++) open("Tab " + i);
        await sleep(1200);
        const list = normal();
        const strip = box(document.getElementById("tabbrowser-tabs"));
        gBrowser.selectedTab = list[0];
        const seenFirst = await settled(list[0]);
        const target = list.at(-1);
        gBrowser.selectedTab = target;
        const seen = await settled(target);
        const boxes = list.slice(0, 5).map(box);
        const scroll = gZenWorkspaces.activeScrollbox.scrollbox;
        const wheel = async dy => {
          const r = box(gZenWorkspaces.activeScrollbox);
          gZenWorkspaces.activeScrollbox.dispatchEvent(new WheelEvent("wheel", {
            bubbles: true, cancelable: true, view: window, deltaY: dy, deltaMode: 0, clientX: r.x + 200, clientY: r.y + 10,
          }));
          await sleep(500);
        };
        const beforeWheel = [scroll.scrollLeft, scroll.scrollTop];
        for (let i = 0; i < 4; i++) await wheel(-120);
        const afterWheel = [scroll.scrollLeft, scroll.scrollTop];
        const scrollState = { beforeWheel, afterWheel, rowY: box(target).y, seenY: seen.y, orient: gZenWorkspaces.activeScrollbox.getAttribute("orient") };
        const win = [innerWidth, innerHeight];
        const page = box(document.getElementById("tabbrowser-tabbox"));
        await closeNormal();
        await sleep(600);
        return { count: list.length, strip, seen, seenFirst, boxes, win, page, scrollState };
        """,
        timeout=60,
    )
    check(d["count"] >= 30, "tabs missing", d)
    in_line(b, d["boxes"], horizontal)
    s = d["strip"]
    for t, which in ((d["seen"], "last"), (d["seenFirst"], "first")):
        if horizontal:
            check(t["x"] >= s["x"] - 2 and t["x"] + t["w"] <= s["x"] + s["w"] + 2, f"selecting the {which} tab didn't bring it into view", d)
            check(t["y"] >= s["y"] - 2 and t["y"] + t["h"] <= s["y"] + s["h"] + 2, f"the {which} tab left the row", d)
        else:
            check(t["y"] >= s["y"] - 4 and t["y"] + t["h"] <= s["y"] + s["h"] + 4, f"selecting the {which} tab didn't bring it into view", d)
    if horizontal:
        check(s["h"] <= 40, "the row grew", s)
        w = d["scrollState"]
        check(w["afterWheel"][0] != w["beforeWheel"][0], "the wheel doesn't scroll the row", w)
        check(w["afterWheel"][1] == 0 and w["rowY"] == w["seenY"], "the row moved vertically", w)


def essentials(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["E1", "E2", "Plain"]) open(n);
        await sleep(400);
        const by = n => gBrowser.visibleTabs.find(t => t.label === n);
        const es = [by("E1"), by("E2")];
        gZenPinnedTabManager.addToEssentials(es);
        await sleep(800);
        const boxes = es.map(box);
        const plain = box(by("Plain"));
        const flags = es.map(t => t.hasAttribute("zen-essential"));
        for (const t of es) gZenPinnedTabManager.removeEssentials(t);
        await sleep(600);
        return { boxes, plain, flags, left: es.filter(t => t.hasAttribute("zen-essential")).length };
        """,
    )
    check(all(d["flags"]), "tabs didn't become essentials", d)
    for t in d["boxes"]:
        check(t["w"] > 16 and t["h"] > 16, "an essential has no size", t)
    if horizontal:
        check(d["boxes"][0]["y"] == d["boxes"][1]["y"], "essentials aren't in the row", d)
        check(d["boxes"][-1]["x"] + d["boxes"][-1]["w"] <= d["plain"]["x"] + 1, "essentials aren't first", d)
    check(d["left"] == 0, "removing essentials failed", d)


def keyboard_and_lifecycle(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["K1", "K2", "K3"]) open(n);
        await sleep(400);
        const list = normal();
        gBrowser.selectedTab = list[0];
        await sleep(100);
        const start = gBrowser.selectedTab.label;
        gBrowser.tabContainer.advanceSelectedTab(1, true);
        await sleep(200);
        const next = gBrowser.selectedTab.label;
        const made = open("Made");
        await sleep(300);
        const hasMade = names(normal()).includes("Made");
        gBrowser.removeTab(made, { animate: false });
        await sleep(300);
        const hasAfter = names(normal()).includes("Made");
        SessionWindowUI.undoCloseTab(window);
        await sleep(800);
        const restored = names(normal()).includes("Made");
        return { start, next, hasMade, hasAfter, restored };
        """,
    )
    check(d["start"] != d["next"], "keyboard tab switching did nothing", d)
    check(d["hasMade"] and not d["hasAfter"], "opening or closing a tab failed", d)
    check(d["restored"], "reopening a closed tab failed", d)


def switching(b, horizontal):
    """Switching orientation with tabs open keeps tabs, selection, pins and workspace."""
    d = run(
        b,
        """
        const start = !Services.prefs.getBoolPref("zen.tabs.vertical");
        await closeNormal();
        for (const n of ["S1", "S2", "S3"]) open(n);
        const pin = open("SPin");
        await sleep(400);
        gBrowser.pinTab(pin);
        const by = n => gBrowser.visibleTabs.find(t => t.label === n);
        gBrowser.selectedTab = by("S2");
        await sleep(400);
        const snap = () => ({ tabs: gBrowser.tabs.map(t => t.linkedPanel), order: names(normal()), sel: gBrowser.selectedTab.label,
                              pin: pin.pinned, ws: gZenWorkspaces.activeWorkspace, row: normal().map(box),
                              browser: !!gBrowser.selectedBrowser.currentURI });
        const a = snap();
        Services.prefs.setBoolPref("zen.tabs.vertical", start);
        await sleep(900);
        const c = snap();
        const attr = document.documentElement.hasAttribute("nyx-tabs-horizontal");
        Services.prefs.setBoolPref("zen.tabs.vertical", !start);
        await sleep(900);
        const e = snap();
        gBrowser.unpinTab(pin);
        return { a, c, e, attr, start };
        """,
    )
    a, c, e = d["a"], d["c"], d["e"]
    for later, name in ((c, "switching"), (e, "switching back")):
        check(later["tabs"] == a["tabs"], f"{name} changed the open tabs", d)
        check(later["order"] == a["order"], f"{name} changed the tab order", d)
        check(later["sel"] == a["sel"], f"{name} changed the selected tab", d)
        check(later["pin"], f"{name} lost the pin", d)
        check(later["ws"] == a["ws"], f"{name} changed the workspace", d)
    in_line(b, a["row"], horizontal)
    in_line(b, c["row"], not horizontal)
    in_line(b, e["row"], horizontal)


def drag_into_folder(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["In1", "In2", "Mover"]) open(n);
        await sleep(400);
        const by = n => gBrowser.tabs.find(t => t.label === n);
        const inside = [by("In1"), by("In2")];
        for (const t of inside) gBrowser.pinTab(t);
        await sleep(300);
        const folder = await gZenFolders.createFolder(inside, { label: "Target", renameFolder: false, workspaceId: gZenWorkspaces.activeWorkspace });
        await sleep(700);
        const mover = by("Mover");
        await drag(mover, inside[0], false);
        await sleep(500);
        const joined = mover.group === folder;
        const pinnedAfter = mover.pinned;
        const count = folder.tabs.length;
        await folder.delete?.();
        return { joined, pinnedAfter, count };
        """,
    )
    check(d["joined"], "dropping a tab on a folder didn't add it", d)


def drag_between_sections(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        for (const n of ["Sec1", "Sec2", "Sec3"]) open(n);
        await sleep(400);
        const by = n => gBrowser.visibleTabs.find(t => t.label === n);
        gBrowser.pinTab(by("Sec1"));
        await sleep(500);
        const pin = by("Sec1"), mover = by("Sec2");
        await drag(mover, pin, true);
        await sleep(500);
        const pinnedByDrag = mover.pinned;
        const m2 = by("Sec2");
        const plain = by("Sec3");
        await drag(m2, plain, true);
        await sleep(500);
        const unpinnedByDrag = !m2.pinned;
        for (const t of gBrowser.visibleTabs.filter(t => t.pinned && !t.hasAttribute("zen-essential") && !t.hasAttribute("zen-empty-tab") && !t.group)) gBrowser.unpinTab(t);
        return { pinnedByDrag, unpinnedByDrag };
        """,
    )
    check(d["pinnedByDrag"], "dragging a tab into the pinned section didn't pin it", d)
    check(d["unpinnedByDrag"], "dragging a tab out of the pinned section didn't unpin it", d)


def compact_mode(b, horizontal):
    d = run(
        b,
        """
        await closeNormal();
        open("Compact");
        await sleep(300);
        // The sidebar, or with tabs in rows the rows: the top bar's wrapper.
        const bar = Services.prefs.getBoolPref("zen.tabs.vertical") ? gNavToolbox : document.getElementById("zen-appcontent-navbar-wrapper");
        const pageBefore = box(document.getElementById("tabbrowser-tabbox"));
        gZenCompactModeManager.preference = true;
        await sleep(1200);
        const toolbox = box(bar);
        const page = box(document.getElementById("tabbrowser-tabbox"));
        const attrs = { hover: bar.hasAttribute("zen-has-hover"), compact: document.documentElement.getAttribute("zen-compact-mode") };
        gZenCompactModeManager._setElementExpandAttribute(bar, true);
        await sleep(900);
        const shown = box(bar);
        const hovering = bar.hasAttribute("zen-has-hover");
        gZenCompactModeManager._setElementExpandAttribute(bar, false);
        gZenCompactModeManager.preference = false;
        await sleep(1200);
        const pageAfter = box(document.getElementById("tabbrowser-tabbox"));
        const toolboxAfter = box(bar);
        return { pageBefore, toolbox, page, attrs, shown, hovering, pageAfter, toolboxAfter, win: [innerWidth, innerHeight] };
        """,
    )
    check(d["page"]["w"] >= d["win"][0] - 20, "compact mode didn't give the page the window's width", d)
    if horizontal:
        check(d["page"]["h"] >= d["win"][1] - 20, "compact mode didn't give the page the rows' height", d)
    t, u = d["toolbox"], d["shown"]
    check(d["hovering"], "hovering the edge wasn't noticed", d)
    if horizontal:
        # Zen leaves a strip as tall as the frame's separation (8px) to reveal them from.
        check(t["y"] + t["h"] <= 8, "compact mode didn't slide the rows away", d)
        check(u["y"] >= -1 and u["w"] >= d["win"][0] - 2 and u["h"] < 110, "hovering didn't bring back the rows", d)
    else:
        check(t["x"] + t["w"] <= 6, "compact mode didn't slide the sidebar away", d)
        check(u["x"] >= -5 and u["w"] > 50, "hovering didn't bring back the sidebar", d)
    check(abs(d["pageAfter"]["h"] - d["pageBefore"]["h"]) <= 2 and abs(d["pageAfter"]["w"] - d["pageBefore"]["w"]) <= 2, "leaving compact mode didn't restore the layout", d)


def second_window(b, horizontal):
    d = run(
        b,
        """
        const win = OpenBrowserWindow();
        await new Promise(r => win.addEventListener("load", r, { once: true }));
        await new Promise(r => { const o = (s, t) => { if (s === win) { Services.obs.removeObserver(o, t); r(); } }; Services.obs.addObserver(o, "browser-delayed-startup-finished"); });
        await sleep(1500);
        const doc = win.document;
        const r = {
          attr: doc.documentElement.hasAttribute("nyx-tabs-horizontal"),
          orient: win.gBrowser.tabContainer.getAttribute("orient"),
          scroll: win.gZenWorkspaces.activeScrollbox?.getAttribute("orient"),
          nyx: !!win.NyxSidebar && !!win.NyxAppearance,
          page: (() => { const b = doc.getElementById("tabbrowser-tabbox").getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })(),
          size: [win.innerWidth, win.innerHeight],
        };
        win.close();
        await sleep(800);
        return r;
        """,
        timeout=60,
    )
    want = "horizontal" if horizontal else "vertical"
    check(d["attr"] == horizontal and d["orient"] == want and d["scroll"] == want, "a second window has the wrong orientation", d)
    check(d["nyx"], "a second window didn't load Browser's own chrome", d)
    if horizontal:
        check(d["page"]["w"] > d["size"][0] - 40, "a second window's page doesn't span it", d)



TESTS = [layout, drag_reorder, drop_side, pinned, folders, workspaces, split_view, overflow, essentials, keyboard_and_lifecycle, drag_into_folder, drag_between_sections, compact_mode, second_window, switching]


def session_restore(horizontal, shots):
    """Tabs, pins, order and orientation survive a restart of the same profile."""
    home = Path(tempfile.mkdtemp(prefix="nyx-browser-session-"))
    prefs = {"zen.tabs.vertical": not horizontal, "nyx.sidebar.mode": "expanded", "browser.startup.page": 3, "browser.sessionstore.resume_from_crash": False}
    b = Browser(prefs, home=home)
    b.start()
    try:
        before = run(
            b,
            """
            for (const n of ["R1", "R2", "R3"]) gBrowser.addTab(`https://example.invalid/${n}`, { triggeringPrincipal: P, skipAnimation: true });
            await sleep(500);
            const pin = gBrowser.visibleTabs.find(t => t.linkedBrowser.currentURI.spec.endsWith("R1") || t.linkedBrowser.userTypedValue === "x");
            await sleep(1500);
            const uris = () => gBrowser.visibleTabs.filter(t => !t.hasAttribute("zen-empty-tab")).map(t => t.linkedBrowser.currentURI.spec);
            const tabs = gBrowser.visibleTabs.filter(t => !t.hasAttribute("zen-empty-tab"));
            gBrowser.pinTab(tabs.at(-1));
            await sleep(500);
            for (const n of ["S1", "S2", "F1", "F2"]) gBrowser.addTab(`https://example.invalid/${n}`, { triggeringPrincipal: P, skipAnimation: true });
            await sleep(1500);
            const find = n => gBrowser.visibleTabs.find(t => t.linkedBrowser.currentURI.spec.endsWith(n) || (t.linkedBrowser.userTypedValue || "").endsWith(n) || SessionStore.getLazyTabValue(t, "url")?.endsWith(n));
            const pair = [find("S1"), find("S2")];
            gBrowser.selectedTab = pair[0];
            await sleep(300);
            gZenViewSplitter.splitTabs(pair);
            await sleep(1000);
            const inFolder = [find("F1"), find("F2")];
            for (const t of inFolder) gBrowser.pinTab(t);
            await sleep(300);
            await gZenFolders.createFolder(inFolder, { label: "Kept", renameFolder: false, workspaceId: gZenWorkspaces.activeWorkspace });
            await sleep(3000);
            return { uris: uris(), pinned: gBrowser.visibleTabs.filter(t => t.pinned && !t.hasAttribute("zen-empty-tab") && !t.group).map(t => t.linkedBrowser.currentURI.spec),
                     split: pair.every(t => t.group?.hasAttribute("split-view-group")), folder: inFolder.every(t => t.group?.isZenFolder) };
            """,
        )
        b.restart()
        time.sleep(3)
        after = run(
            b,
            """
            await sleep(1500);
            const tabs = gBrowser.visibleTabs.filter(t => !t.hasAttribute("zen-empty-tab"));
            const uri = t => t.linkedBrowser.currentURI.spec !== "about:blank" ? t.linkedBrowser.currentURI.spec : (SessionStore.getLazyTabValue(t, "url") || "about:blank");
            return { uris: tabs.map(uri), pinned: tabs.filter(t => t.pinned).map(uri),
                     folders: [...document.querySelectorAll("zen-folder")].map(f => f.label),
                     splits: document.querySelectorAll("tab-split-view-wrapper, tab-group[split-view-group]").length,
                     row: tabs.filter(t => !t.pinned && !t.group).map(box), orient: gBrowser.tabContainer.getAttribute("orient"),
                     attr: document.documentElement.hasAttribute("nyx-tabs-horizontal") };
            """,
        )
        if shots:
            b.screenshot(Path(shots) / f"session-{'horizontal' if horizontal else 'vertical'}.png")
    finally:
        b.stop()
    check(after["orient"] == ("horizontal" if horizontal else "vertical"), "the orientation changed", after)
    check(after["attr"] == horizontal, "the layout didn't come back", after)
    missing = [u for u in before["uris"] if u not in after["uris"] and "invalid" in u]
    check(not missing, "tabs didn't come back", {"before": before, "after": after})
    check(before["pinned"] and set(before["pinned"]) <= set(after["pinned"]), "the pin didn't come back", {"before": before, "after": after})
    check(before["split"] and before["folder"], "the split or folder wasn't set up", before)
    check("Kept" in after["folders"], "the folder didn't come back", after)
    check(after["splits"] >= 1, "the split view didn't come back", after)
    if len(after["row"]) > 1:
        in_line(None, after["row"], horizontal)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots")
    ap.add_argument("--only")
    ap.add_argument("--orientation", choices=["vertical", "horizontal"])
    opts = ap.parse_args()
    results = []

    runs = (("vertical", False, "expanded"), ("vertical rail", False, "compact"), ("horizontal", True, "auto"))
    for name, horizontal, sidebar in runs:
        if opts.orientation and opts.orientation != name.split()[0]:
            continue
        with Browser({"zen.tabs.vertical": not horizontal, "nyx.sidebar.mode": sidebar}) as b:
            for test in TESTS:
                if opts.only and opts.only != test.__name__:
                    continue
                try:
                    test(b, horizontal)
                    results.append((name, test.__name__, None))
                    print(f"PASS {name:13} {test.__name__}", flush=True)
                except (Failed, ScriptError, TimeoutError, ConnectionError) as error:
                    results.append((name, test.__name__, str(error)))
                    print(f"FAIL {name:13} {test.__name__}: {str(error)[:900]}", flush=True)
                    if opts.shots:
                        b.screenshot(Path(opts.shots) / f"fail-{name.replace(' ', '-')}-{test.__name__}.png")
                if opts.shots and not results[-1][2]:
                    b.screenshot(Path(opts.shots) / f"{name.replace(' ', '-')}-{test.__name__}.png")
        if (not opts.only or opts.only == "session_restore") and sidebar != "compact":
            try:
                session_restore(horizontal, opts.shots)
                results.append((name, "session_restore", None))
                print(f"PASS {name:13} session_restore", flush=True)
            except (Failed, ScriptError, TimeoutError, ConnectionError) as error:
                results.append((name, "session_restore", str(error)))
                print(f"FAIL {name:13} session_restore: {str(error)[:900]}", flush=True)

    failed = [r for r in results if r[2]]
    print(f"\n{len(results) - len(failed)} of {len(results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
