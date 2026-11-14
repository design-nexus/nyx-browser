/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The Appearance panel (Ctrl+, and the Settings button), and F1 for the keyboard shortcuts.
 * The layout, sidebar and effects are prefs; theme, accent and density go
 * to appearance.json, which the theme bridge resolves through Theme Engine 2.0 (NyxTheme). */
{
  const SWATCHES = ["blue", "violet", "pink", "red", "coral", "amber", "green", "teal", "graphite"];
  const BUTTON = "nyx-settings-button";
  const { NyxTheme } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxTheme.sys.mjs");

  let saved = { theme: "follow", accent: "", density: "" };
  // The theme's name to show: the one chosen, or the system's when Browser follows it.
  let themeName = "";

  const html = (tag, props = {}, ...children) => {
    const element = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    for (const [name, value] of Object.entries(props)) {
      if (name === "onclick") {
        element.addEventListener("click", value);
      } else if (name === "l10n") {
        document.l10n.setAttributes(element, ...[value].flat());
      } else {
        element.setAttribute(name, value);
      }
    }
    element.append(...children);
    return element;
  };

  async function load() {
    saved = await NyxTheme.choices();
    render();
    const data = await NyxTheme.themes().catch(() => null);
    themeName = saved.theme === "follow" ? data?.system.name ?? "" : data?.themes.find(t => t.id === saved.theme)?.name ?? saved.theme;
    render();
  }

  async function save(change) {
    saved = { ...saved, ...change };
    render();
    saved = await NyxTheme.choose(change);
  }

  /** A row of choices. `options` are [value, Fluent id]. */
  function segment(labelId, noteId, options, current, choose, disabled = false) {
    const row = html("div", { class: "nyx-seg" + (disabled ? " nyx-disabled" : ""), role: "radiogroup", l10n: `${labelId}-group` });
    for (const [value, l10nId] of options) {
      const on = value === current;
      row.append(html("button", { class: on ? "nyx-on" : "", role: "radio", "aria-checked": String(on), type: "button", l10n: l10nId, onclick: () => disabled || choose(value) }));
    }
    const title = html("div", { class: "nyx-opt-label" }, html("span", { l10n: labelId }));
    if (noteId) {
      title.append(html("small", { l10n: noteId }));
    }
    return html("div", { class: "nyx-opt" }, title, row);
  }

  function render() {
    const body = document.getElementById("nyx-appearance-body");
    if (!body) {
      return;
    }
    const layout = window.NyxLayout?.current() ?? "studio";
    const vertical = layout !== "workbench";
    const modes = [["auto", "nyx-appearance-pop-auto"], ["expanded", "nyx-appearance-pop-expanded"], ["compact", "nyx-appearance-pop-compact"], ["hidden", "nyx-appearance-pop-hidden"]].filter(([value]) => layout !== "focus" || value !== "compact");
    const mode = Services.prefs.getStringPref("nyx.sidebar.mode", "auto");
    const frosted = Services.prefs.getBoolPref("nyx.effects.frosted", false);

    const swatches = html("div", { class: "nyx-swatches", role: "radiogroup", l10n: "nyx-appearance-pop-accent-group" });
    swatches.append(
      html("button", { class: "nyx-swatch nyx-swatch-default" + (saved.accent ? "" : " nyx-on"), type: "button", l10n: "nyx-appearance-pop-accent-default", onclick: () => save({ accent: "" }) })
    );
    for (const name of SWATCHES) {
      swatches.append(html("button", { class: `nyx-swatch nyx-swatch-${name}` + (saved.accent === name ? " nyx-on" : ""), type: "button", l10n: `nyx-accent-${name}`, onclick: () => save({ accent: name }) }));
    }
    const close = () => document.getElementById("nyx-appearance-panel").hidePopup();
    const theme = html(
      "button",
      { class: "nyx-theme-row", type: "button", onclick: () => { close(); BrowserAddonUI.openAddonsMgr("addons://list/theme"); } },
      html("span", saved.theme === "follow" ? { l10n: ["nyx-appearance-pop-theme-follow", { name: themeName }] } : {}, saved.theme === "follow" ? "" : themeName),
      html("span", { class: "nyx-theme-more", l10n: "nyx-appearance-pop-all-themes" })
    );

    body.replaceChildren(
      html("div", { class: "nyx-pop-head", l10n: "nyx-appearance-pop-title" }),
      segment("nyx-appearance-pop-layout", "", [["studio", "nyx-appearance-pop-studio"], ["focus", "nyx-appearance-pop-focus"], ["workbench", "nyx-appearance-pop-workbench"]], layout, value => {
        Services.prefs.setStringPref("nyx.layout", value);
        render();
      }),
      segment(
        "nyx-appearance-pop-sidebar",
        vertical ? (mode === "auto" ? "nyx-appearance-pop-sidebar-auto" : "") : "nyx-appearance-pop-sidebar-vertical",
        modes,
        layout === "focus" && mode === "compact" ? "expanded" : mode,
        value => {
          Services.prefs.setStringPref("nyx.sidebar.mode", value);
          render();
        },
        !vertical
      ),
      html("div", { class: "nyx-opt" }, html("div", { class: "nyx-opt-label" }, html("span", { l10n: "nyx-appearance-pop-theme" })), theme),
      html("div", { class: "nyx-opt" }, html("div", { class: "nyx-opt-label" }, html("span", { l10n: "nyx-appearance-pop-accent" })), swatches),
      segment("nyx-appearance-pop-density", "", [["", "nyx-appearance-pop-density-default"], ["compact", "nyx-appearance-pop-compact"], ["balanced", "nyx-appearance-pop-balanced"], ["relaxed", "nyx-appearance-pop-relaxed"]], saved.density, value => save({ density: value })),
      html(
        "button",
        {
          class: "nyx-switch-row",
          type: "button",
          role: "switch",
          "aria-checked": String(frosted),
          onclick: () => {
            Services.prefs.setBoolPref("nyx.effects.frosted", !frosted);
            render();
          },
        },
        html("span", { l10n: "nyx-appearance-pop-frosted" }),
        html("span", { class: "nyx-switch" + (frosted ? " nyx-on" : "") })
      ),
      html("div", { class: "nyx-line" }),
      html("button", { class: "nyx-row", type: "button", l10n: "nyx-appearance-pop-all", onclick: () => { close(); openPreferences("paneNyxAppearance"); } })
    );
  }

  function buildPanel() {
    const panel = document.createXULElement("panel");
    panel.id = "nyx-appearance-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("position", "bottomright topright");
    panel.setAttribute("role", "dialog");
    document.l10n.setAttributes(panel, "nyx-appearance-pop-panel");
    panel.append(html("div", { id: "nyx-appearance-body" }));
    panel.addEventListener("popupshowing", load);
    document.getElementById("mainPopupSet").append(panel);
    return panel;
  }

  function open(anchor) {
    const panel = document.getElementById("nyx-appearance-panel") || buildPanel();
    load();
    panel.openPopup(anchor || document.getElementById(BUTTON), "bottomright topright");
  }

  window.NyxAppearance = { open, load, render };

  document.getElementById(BUTTON)?.addEventListener("command", event => open(event.currentTarget));

  window.addEventListener(
    "keydown",
    event => {
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key === ",") {
        event.preventDefault();
        open();
      } else if (event.key === "F1" && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        // The keyboard shortcuts (Settings › Gestures › Keyboard shortcuts).
        event.preventDefault();
        openPreferences("paneNyxGestures-keys");
      }
    },
    true
  );

  // Firefox's task manager (Shift+Esc, about:processes) is a diagnostic page Browser doesn't offer.
  document.getElementById("View:AboutProcesses")?.setAttribute("disabled", "true");
}
