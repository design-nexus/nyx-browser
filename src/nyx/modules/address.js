/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The address field's dropdown, the same in every layout: what each result is on its right, the
 * search engine in a chip (Tab picks another), / for commands only, and a foot with the keys and
 * the other engines. Studio and Workbench open it under the address, Focus over the page. Its
 * groups are UrlbarView's (nyx/patches), its commands Zen's provider's. */
{
  const HTML = "http://www.w3.org/1999/xhtml";
  const { UrlbarShared } = ChromeUtils.importESModule("chrome://browser/content/urlbar/UrlbarShared.mjs");
  const html = (tag, className, text) => {
    const node = document.createElementNS(HTML, tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  };
  const key = text => html("kbd", "nyx-key", text);

  // ---- Where it opens: in place, or over the page in Focus (and in full screen, as Zen has it).

  Object.defineProperty(gURLBar, "zenUrlbarBehavior", {
    configurable: true,
    get() {
      const root = document.documentElement;
      return root.hasAttribute("inDOMFullscreen") || root.getAttribute("nyx-layout") === "focus" ? "float" : "normal";
    },
  });

  // ---- Its words.

  const KINDS = ["search", "open", "switch", "bookmark", "history", "command"];
  let words = null;
  const ready = new Localization(["browser/nyx-browser.ftl"])
    .formatValues([
      ...KINDS.map(kind => ({ id: `nyx-urlbar-kind-${kind}` })),
      ...["open", "new-tab", "engine", "commands"].map(hint => ({ id: `nyx-urlbar-hint-${hint}` })),
      { id: "nyx-urlbar-search-with" },
    ])
    .then(values => {
      words = Object.fromEntries(KINDS.map((kind, i) => [kind, values[i]]));
      words.hints = values.slice(KINDS.length, KINDS.length + 4);
      words.searchWith = values.at(-1);
    });

  // ---- What each result is, on its right; the selected one also says Enter.

  function kindOf(row) {
    const result = row.result;
    if (!result) {
      return "";
    }
    switch (result.type) {
      case UrlbarShared.RESULT_TYPE.SEARCH:
        return words.search;
      case UrlbarShared.RESULT_TYPE.TAB_SWITCH:
      case UrlbarShared.RESULT_TYPE.REMOTE_TAB:
        return words.switch;
      case UrlbarShared.RESULT_TYPE.DYNAMIC:
        return result.payload.zenAction && !result.payload.shortcutContent ? words.command : "";
      case UrlbarShared.RESULT_TYPE.URL:
      case UrlbarShared.RESULT_TYPE.KEYWORD:
        if (result.heuristic) {
          return words.open;
        }
        return result.source === UrlbarShared.RESULT_SOURCE.BOOKMARKS ? words.bookmark : words.history;
    }
    return "";
  }

  function label(row) {
    const inner = row.querySelector(":scope > .urlbarView-row-inner");
    if (!inner) {
      return;
    }
    const kind = kindOf(row);
    let tag = inner.querySelector(":scope > .nyx-kind");
    if (!kind) {
      tag?.remove();
      return;
    }
    if (!tag) {
      tag = html("span", "nyx-kind");
      tag.append(html("span", "nyx-kind-text"), key("↵"));
      tag.setAttribute("aria-hidden", "true");
    }
    if (tag.firstChild.textContent !== kind) {
      tag.firstChild.textContent = kind;
    }
    if (tag.parentNode !== inner || tag.nextSibling) {
      inner.append(tag);
    }
    row.toggleAttribute("nyx-bookmark", row.result.source === UrlbarShared.RESULT_SOURCE.BOOKMARKS);
  }

  const results = gURLBar.view.panel.querySelector(".urlbarView-results");
  let frame = 0;
  const relabel = () => {
    frame = 0;
    if (words) {
      for (const row of results.querySelectorAll(".urlbarView-row")) {
        label(row);
      }
    }
  };
  new MutationObserver(() => {
    frame ||= requestAnimationFrame(relabel);
  }).observe(results, { childList: true, subtree: true, attributes: true, attributeFilter: ["type"] });

  // ---- The engine: a chip in the field while it's open; Tab, Shift+Tab or a click picks another.

  const store = gURLBar.controller.engineStore;
  const storeReady = store.init();
  const engineIcon = async engine => (await engine.getIconURL?.()) || "chrome://browser/skin/zen-icons/search-glass.svg";
  const allEngines = () => store.getEngines().filter(engine => !engine.hideOneOffButton);
  const shownEngine = () => {
    const name = gURLBar.searchMode?.engineName;
    return (name && store.getEngineByName(name)) || store.default;
  };

  const chip = html("button", "nyx-engine-chip");
  chip.id = "nyx-engine-chip";
  chip.append(html("img"), html("span"));
  chip.tabIndex = -1;
  chip.addEventListener("mousedown", event => event.preventDefault());
  chip.addEventListener("click", event => pickEngine(event.shiftKey));
  gURLBar.querySelector(".urlbar-input-container")?.append(chip);

  async function showEngine() {
    await storeReady;
    const engine = shownEngine();
    const commands = gURLBar.searchMode?.source === UrlbarShared.RESULT_SOURCE.ZEN_ACTIONS;
    chip.hidden = !engine || commands || (gURLBar.searchMode && !gURLBar.searchMode.engineName);
    if (chip.hidden) {
      return;
    }
    chip.lastChild.textContent = engine.name;
    chip.firstChild.src = await engineIcon(engine);
    document.l10n.setAttributes(chip, "nyx-urlbar-engine", { engine: engine.name });
    gURLBar.toggleAttribute("nyx-engine-mode", !!gURLBar.searchMode?.engineName);
    fillFoot();
  }

  async function pickEngine(back) {
    await storeReady;
    const engines = allEngines();
    if (!engines.length) {
      return;
    }
    const current = shownEngine();
    let index = engines.findIndex(engine => engine.name === current?.name);
    index = (index + (back ? -1 : 1) + engines.length) % engines.length;
    const engine = engines[index];
    if (engine.name === store.default?.name) {
      gURLBar.searchMode = null;
    } else {
      gURLBar.setSearchMode(
        { engineName: engine.name, entry: "searchbutton", isPreview: false, source: UrlbarShared.RESULT_SOURCE.SEARCH },
        gBrowser.selectedBrowser
      );
    }
    if (gURLBar.value) {
      gURLBar.startQuery({ allowAutofill: false });
    }
    showEngine();
  }

  // ---- The foot: the keys, and the other engines to search with in one click.

  const foot = html("div", "nyx-urlbar-foot");
  foot.id = "nyx-urlbar-foot";
  const hints = html("div", "nyx-urlbar-hints");
  const others = html("div", "nyx-urlbar-engines");
  foot.append(hints, others);
  gURLBar.view.panel.append(foot);
  foot.addEventListener("mousedown", event => event.preventDefault());

  function fillHints() {
    const [open, newTab, engine, commands] = words.hints;
    const hint = (keys, text) => {
      const node = html("span", "nyx-urlbar-hint");
      node.append(...keys.map(key), html("span", "", text));
      return node;
    };
    hints.replaceChildren(
      hint(["↵"], open),
      hint([AppConstants.platform === "macosx" ? "⌘" : "Ctrl", "↵"], newTab),
      hint(["Tab"], engine),
      hint(["/"], commands)
    );
  }

  let filling = null;
  function fillFoot() {
    filling ??= (async () => {
      await storeReady;
      const engines = allEngines().filter(engine => engine.name !== shownEngine()?.name).slice(0, 4);
      const buttons = await Promise.all(
        engines.map(async engine => {
          const button = html("button", "nyx-urlbar-engine");
          button.tabIndex = -1;
          button.append(html("img"));
          button.firstChild.src = await engineIcon(engine);
          document.l10n.setAttributes(button, "nyx-urlbar-search-with-engine", { engine: engine.name });
          button.addEventListener("click", () => gURLBar.search(gURLBar.untrimmedValue ?? gURLBar.value, { searchEngine: engine, searchModeEntry: "oneoff" }));
          return button;
        })
      );
      others.replaceChildren(...(buttons.length ? [html("span", "", words.searchWith), ...buttons] : []));
    })().finally(() => (filling = null));
  }

  // ---- Its keys: Tab picks the engine, / alone asks for commands only.

  gURLBar.addEventListener(
    "keydown",
    event => {
      if (event.target !== gURLBar.inputField || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }
      if (event.key === "Tab" && gURLBar.view.isOpen && gURLBar.searchMode?.source !== UrlbarShared.RESULT_SOURCE.ZEN_ACTIONS) {
        event.preventDefault();
        event.stopPropagation();
        pickEngine(event.shiftKey);
      } else if (event.key === "/" && !gURLBar.value && !gURLBar.searchMode) {
        event.stopPropagation();
        gZenUIManager.enableCommandsMode(event);
      }
    },
    true
  );

  new MutationObserver(showEngine).observe(gURLBar, { attributeFilter: ["breakout-extend", "searchmode"] });
  const engines = () => showEngine();
  store.addObserver(engines);
  window.addEventListener("unload", () => store.removeObserver(engines), { once: true });

  ready.then(() => {
    fillHints();
    showEngine();
    relabel();
  });
}
