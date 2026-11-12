/* Horizontal tabs. Zen's zen.tabs.vertical pref already switches tabbrowser's own logic and
 * rebuilds the toolbars; this module does what that pref leaves vertical. Everything here
 * is a no-op while tabs are vertical, and tabs stay open across a switch because only
 * attributes and styles change. */
{
  const PREF = "zen.tabs.vertical";
  const isHorizontal = () => !Services.prefs.getBoolPref(PREF, true);

  function setScrollboxOrient(box, orient) {
    if (box.getAttribute("orient") !== orient) {
      box.setAttribute("orient", orient);
    }
    if (box.scrollbox && box.scrollbox.getAttribute("orient") !== orient) {
      box.scrollbox.setAttribute("orient", orient);
    }
  }

  /** Each workspace owns a scrollbox that Zen creates vertical. */
  function applyToWorkspaces() {
    const orient = isHorizontal() ? "horizontal" : "vertical";
    for (const box of document.querySelectorAll(".workspace-arrowscrollbox")) {
      setScrollboxOrient(box, orient);
    }
    const outer = document.getElementById("tabbrowser-arrowscrollbox");
    if (outer) {
      setScrollboxOrient(outer, orient);
    }
  }

  function apply() {
    document.documentElement.toggleAttribute("nyx-tabs-horizontal", isHorizontal());
    applyToWorkspaces();
  }

  /** Zen's drop logic reads the Y axis in two public methods. */
  function patchDragAndDrop() {
    const proto = window.ZenDragAndDrop?.prototype;
    if (!proto || proto._nyxPatched) {
      return;
    }
    proto._nyxPatched = true;

    const dropsBefore = proto._dropsBefore;
    proto._dropsBefore = function (event, rect) {
      if (!isHorizontal()) {
        return dropsBefore.call(this, event, rect);
      }
      const threshold = Services.prefs.getIntPref("browser.tabs.dragDrop.moveOverThresholdPercent") / 100;
      const before = (event.clientX - rect.left) / rect.width <= threshold;
      this._nyxDrop = { rect, before };
      return before;
    };

    const placeIndicator = proto._placeDropIndicator;
    proto._placeDropIndicator = function (options) {
      const indicator = placeIndicator.call(this, options);
      if (isHorizontal() && this._nyxDrop) {
        const { rect, before } = this._nyxDrop;
        indicator.setAttribute("orientation", "vertical");
        indicator.style.setProperty("--nyx-drop-x", `${Math.round(before ? rect.left : rect.right)}px`);
        indicator.style.setProperty("--nyx-drop-y", `${Math.round(rect.top)}px`);
        indicator.style.setProperty("--nyx-drop-h", `${Math.round(rect.height)}px`);
      }
      return indicator;
    };
  }

  /** Zen stops wheel events on its scrollboxes because vertical ones scroll natively. A
   * row needs a vertical wheel turned into sideways scrolling. Sideways trackpad swipes
   * stay Zen's, which switch workspaces. */
  function onTabsWheel(event) {
    if (!isHorizontal() || event.deltaY === 0 || event.ctrlKey || event.metaKey) {
      return;
    }
    const box = window.gZenWorkspaces?.activeScrollbox;
    if (!box?.overflowing || window.gZenWorkspaces._swipeManager?.isGestureActive) {
      return;
    }
    let delta = event.deltaY;
    if (event.deltaMode === event.DOM_DELTA_LINE) {
      delta *= box.lineScrollAmount;
    } else if (event.deltaMode === event.DOM_DELTA_PAGE) {
      delta *= box.scrollClientSize;
    }
    box.scrollByPixels(delta, true);
    event.preventDefault();
    event.stopPropagation();
  }

  apply();
  patchDragAndDrop();
  Services.prefs.addObserver(PREF, apply);
  window.addEventListener("unload", () => Services.prefs.removeObserver(PREF, apply), { once: true });

  // Zen forces the outer scrollbox vertical late in startup and adds workspaces at any time.
  const startupDone = (subject, topic) => {
    if (subject !== window) {
      return;
    }
    Services.obs.removeObserver(startupDone, topic);
    patchDragAndDrop();
    apply();
    document.getElementById("tabbrowser-tabs")?.addEventListener("wheel", onTabsWheel, { capture: true, passive: false });
    const outer = document.getElementById("tabbrowser-arrowscrollbox");
    if (outer) {
      new MutationObserver(applyToWorkspaces).observe(outer, { childList: true, attributes: true, attributeFilter: ["orient"] });
    }
    window.gZenWorkspaces?.promiseInitialized?.then(apply);
  };
  Services.obs.addObserver(startupDone, "browser-delayed-startup-finished");
}
