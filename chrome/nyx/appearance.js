/* The Appearance panel. Orientation, sidebar and effects are prefs read right here; theme,
 * accent and density go to a file the launcher reads, because the launcher resolves them
 * through the suite's theme code. */
{
  const CONFIG = Services.env.get("XDG_CONFIG_HOME") || PathUtils.join(Services.env.get("HOME"), ".config");
  const FILE = PathUtils.join(CONFIG, "nyx-browser", "appearance.json");
  const SWATCHES = ["blue", "violet", "pink", "red", "coral", "amber", "green", "teal", "graphite"];
  const WIDGET = "nyx-appearance-button";

  let saved = { theme: "follow", accent: "", density: "" };

  const html = (tag, props = {}, ...children) => {
    const element = document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    for (const [name, value] of Object.entries(props)) {
      if (name === "onclick") {
        element.addEventListener("click", value);
      } else {
        element.setAttribute(name, value);
      }
    }
    element.append(...children);
    return element;
  };

  async function load() {
    try {
      saved = { ...saved, ...(await IOUtils.readJSON(FILE)) };
    } catch {
      // No choices made yet.
    }
    render();
  }

  async function save(change) {
    saved = { ...saved, ...change };
    render();
    await IOUtils.makeDirectory(PathUtils.parent(FILE), { ignoreExisting: true });
    await IOUtils.writeJSON(FILE, saved, { tmpPath: `${FILE}.tmp` });
  }

  function segment(label, note, options, current, choose, disabled = false) {
    const row = html("div", { class: "nyx-seg" + (disabled ? " nyx-disabled" : ""), role: "radiogroup", "aria-label": label });
    for (const [value, text] of options) {
      const on = value === current;
      row.append(html("button", { class: on ? "nyx-on" : "", role: "radio", "aria-checked": String(on), type: "button", onclick: () => disabled || choose(value) }, text));
    }
    const title = html("div", { class: "nyx-opt-label" }, label);
    if (note) {
      title.append(html("small", {}, note));
    }
    return html("div", { class: "nyx-opt" }, title, row);
  }

  function render() {
    const body = document.getElementById("nyx-appearance-body");
    if (!body) {
      return;
    }
    const vertical = Services.prefs.getBoolPref("zen.tabs.vertical", true);
    const mode = Services.prefs.getStringPref("nyx.sidebar.mode", "auto");
    const frosted = Services.prefs.getBoolPref("nyx.effects.frosted", false);

    const swatches = html("div", { class: "nyx-swatches", role: "radiogroup", "aria-label": "Accent" });
    swatches.append(
      html("button", { class: "nyx-swatch nyx-swatch-default" + (saved.accent ? "" : " nyx-on"), type: "button", title: "Theme default", "aria-label": "Theme default", onclick: () => save({ accent: "" }) })
    );
    for (const name of SWATCHES) {
      const label = name[0].toUpperCase() + name.slice(1);
      swatches.append(
        html("button", {
          class: `nyx-swatch nyx-swatch-${name}` + (saved.accent === name ? " nyx-on" : ""),
          type: "button",
          title: label,
          "aria-label": label,
          onclick: () => save({ accent: name }),
        })
      );
    }

    body.replaceChildren(
      html("div", { class: "nyx-pop-head" }, "Appearance"),
      segment("Tabs", "", [["vertical", "Vertical"], ["horizontal", "Horizontal"]], vertical ? "vertical" : "horizontal", value => {
        Services.prefs.setBoolPref("zen.tabs.vertical", value === "vertical");
        render();
      }),
      segment(
        "Sidebar",
        vertical ? (mode === "auto" ? "Follows window width" : "") : "Vertical tabs only",
        [["auto", "Automatic"], ["expanded", "Expanded"], ["compact", "Compact"], ["hidden", "Hidden"]],
        mode,
        value => {
          Services.prefs.setStringPref("nyx.sidebar.mode", value);
          render();
        },
        !vertical
      ),
      segment("Theme", "", [["follow", "Follow system"], ["nyx-dark", "Dark"], ["nyx-light", "Light"]], saved.theme, value => save({ theme: value })),
      html("div", { class: "nyx-opt" }, html("div", { class: "nyx-opt-label" }, "Accent"), swatches),
      segment("Density", "", [["", "Default"], ["compact", "Compact"], ["balanced", "Balanced"], ["relaxed", "Relaxed"]], saved.density, value => save({ density: value })),
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
        html("span", {}, "Frosted menus"),
        html("span", { class: "nyx-switch" + (frosted ? " nyx-on" : "") })
      ),
      html("div", { class: "nyx-line" }),
      html("button", { class: "nyx-row", type: "button", onclick: () => { document.getElementById("nyx-appearance-panel").hidePopup(); openPreferences(); } }, "All browser settings")
    );
  }

  function buildPanel() {
    const panel = document.createXULElement("panel");
    panel.id = "nyx-appearance-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("position", "bottomright topright");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Appearance");
    panel.append(html("div", { id: "nyx-appearance-body" }));
    panel.addEventListener("popupshowing", load);
    document.getElementById("mainPopupSet").append(panel);
    return panel;
  }

  function open(anchor) {
    const panel = document.getElementById("nyx-appearance-panel") || buildPanel();
    load();
    panel.openPopup(anchor || document.getElementById(WIDGET) || document.getElementById("urlbar"), "bottomright topright");
  }

  window.NyxAppearance = { open, load, render, file: FILE };

  function applyEffects() {
    document.documentElement.toggleAttribute("nyx-frosted", Services.prefs.getBoolPref("nyx.effects.frosted", false));
  }

  applyEffects();
  Services.prefs.addObserver("nyx.effects.frosted", applyEffects);
  window.addEventListener("unload", () => Services.prefs.removeObserver("nyx.effects.frosted", applyEffects), { once: true });

  window.addEventListener(
    "keydown",
    event => {
      if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key === ",") {
        event.preventDefault();
        open();
      }
    },
    true
  );

  // Registered once per process; every window after the first finds it already there.
  if (!Services.nyxAppearanceWidget) {
    Services.nyxAppearanceWidget = true;
    window.CustomizableUI.createWidget({
      id: WIDGET,
      label: "Settings",
      tooltiptext: "Settings (Ctrl+,)",
      defaultArea: window.CustomizableUI.AREA_NAVBAR,
      onCommand(event) {
        event.target.ownerGlobal.NyxAppearance.open(event.target);
      },
    });
  }
}
