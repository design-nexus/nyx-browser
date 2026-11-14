/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Site styles, Scripts, YouTube and Swift Selection Search import — Settings panes.
 * Prefs bind through Preferences; styles and scripts live in NyxSiteKit. */

/* import-globals-from nyx-settings.js */
/* import-globals-from /browser/components/preferences/preferences.js */

const { NyxSiteKit, SITEKIT_TOPIC, previewStylus, previewTampermonkey } = ChromeUtils.importESModule(
  "chrome://browser/content/nyx/NyxSiteKit.sys.mjs"
);
const { NyxSiteStyles } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxSiteStyles.sys.mjs");
const NyxSelectionImport = ChromeUtils.importESModule(
  "chrome://browser/content/nyx/NyxSelectionImport.sys.mjs"
);

const HTML = "http://www.w3.org/1999/xhtml";
const CM_URI = "resource://devtools/client/shared/sourceeditor/codemirror6/codemirror6.bundle.mjs";

function el(tag, attrs = {}, ...kids) {
  const node = tag.includes(":") || tag === "div" || tag === "span" || tag === "input" || tag === "textarea" || tag === "pre"
    ? document.createElementNS(HTML, tag.replace(/^html:/, ""))
    : document.createXULElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") {
      node.className = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value != null && value !== false) {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) {
      node.append(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
  }
  return node;
}

async function codeMirror(host, { doc, language = "css", readOnly = false }) {
  host.replaceChildren();
  try {
    const mod = ChromeUtils.importESModule(CM_URI, { global: "current" });
    const {
      codemirrorView: { EditorView, lineNumbers, keymap },
      codemirrorState: { EditorState, Compartment },
      codemirrorLangCss,
      codemirrorLangJavascript,
      codemirrorLanguage: { syntaxHighlighting, bracketMatching },
      lezerHighlight,
    } = mod;
    const lang = language === "javascript" ? codemirrorLangJavascript.javascript() : codemirrorLangCss.css();
    const readOnlyComp = new Compartment();
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: doc || "",
        extensions: [
          lineNumbers(),
          bracketMatching(),
          syntaxHighlighting(lezerHighlight.defaultHighlightStyle, { fallback: true }),
          lang,
          EditorView.lineWrapping,
          readOnlyComp.of(EditorState.readOnly.of(readOnly)),
          EditorView.theme({
            "&": { height: "100%", fontSize: "12.5px", backgroundColor: "transparent" },
            ".cm-scroller": { overflow: "auto", fontFamily: "var(--nyx-mono, ui-monospace, monospace)" },
            "&.cm-focused": { outline: "none" },
          }),
          keymap.of(mod.codemirrorView.defaultKeymap || []),
        ],
      }),
    });
    view.setReadOnly = on => view.dispatch({ effects: readOnlyComp.reconfigure(EditorState.readOnly.of(on)) });
    return view;
  } catch (error) {
    console.error("Browser: CodeMirror didn't load, using a text box", error);
    const area = document.createElementNS(HTML, "textarea");
    area.className = "nyx-cm-fallback";
    area.value = doc || "";
    area.readOnly = readOnly;
    host.append(area);
    return {
      get state() {
        return { doc: { toString: () => area.value, length: area.value.length } };
      },
      dispatch({ changes }) {
        if (changes?.insert != null) {
          area.value = changes.insert;
        }
      },
      contentDOM: area,
      setReadOnly(on) {
        area.readOnly = on;
      },
    };
  }
}

function pickFile({ accept, multiple = false }) {
  return new Promise(resolve => {
    const input = document.createElementNS(HTML, "input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...input.files]), { once: true });
    input.click();
  });
}

async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    if (file.name.endsWith(".zip") || file.type.includes("zip")) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
}

// ---- Site styles ----

var gNyxStylesPane = {
  editing: null,
  view: null,
  draft: "",

  init() {
    document.getElementById("nyxStylesImport").addEventListener("command", () => this.import());
    document.getElementById("nyxStylesNew").addEventListener("command", () => this.create());
    document.getElementById("nyxStylesBack").addEventListener("command", () => gotoPref("paneNyxStyles"));
    document.getElementById("nyxStylesSave").addEventListener("command", () => this.save());
    document.getElementById("nyxStylesUndo").addEventListener("command", () => this.undo());
    document.getElementById("nyxStylesEditorEnabled").addEventListener("command", event => {
      if (this.editing?.mine) {
        NyxSiteKit.updateStyle(this.editing.id, { enabled: event.target.checked });
      } else if (this.editing) {
        NyxSiteKit.setBuiltinEnabled(this.editing.id, event.target.checked);
      }
    });
    document.addEventListener("paneshown", event => {
      if (event.detail.category === "paneNyxStyles" && !event.detail.subcategory) {
        this.handleSubcategory(null);
        this.show();
      }
    });
    Services.obs.addObserver(this, SITEKIT_TOPIC);
    window.addEventListener("unload", () => Services.obs.removeObserver(this, SITEKIT_TOPIC), { once: true });
  },

  observe() {
    if (!document.documentElement.hasAttribute("nyx-styles-edit")) {
      this.show();
    }
  },

  handleSubcategory(sub) {
    const edit = sub === "edit";
    document.documentElement.toggleAttribute("nyx-styles-edit", edit);
    document.getElementById("nyxStylesList").hidden = edit;
    document.getElementById("nyxStylesEditor").hidden = !edit;
    return edit;
  },

  async show() {
    await NyxSiteKit.init();
    const { builtin, mine } = await NyxSiteKit.styles();
    const grid = document.getElementById("nyxStylesBuiltin");
    const mineBox = document.getElementById("nyxStylesMine");
    grid.replaceChildren();
    mineBox.replaceChildren();
    for (const style of builtin) {
      grid.append(this.row(style, false));
    }
    if (!mine.length) {
      mineBox.append(el("description", { className: "nyx-row-note", "data-l10n-id": "nyx-styles-none" }));
    }
    for (const style of mine) {
      mineBox.append(this.row(style, true));
    }
  },

  row(style, mine) {
    const row = el("hbox", { className: "nyx-row nyx-style-row", align: "center" });
    const letter = (style.name || "?").replace(/^The |^A /i, "").charAt(0).toUpperCase();
    row.append(
      el("html:span", { className: "nyx-style-ico", text: letter }),
      el("vbox", { className: "nyx-row-text", flex: "1" },
        el("label", { value: style.name }),
        el("description", { className: "nyx-row-note", ...( (style.hosts || []).length
          ? { text: style.hosts.join(" · ") }
          : mine
            ? { "data-l10n-id": "nyx-styles-yours" }
            : {} ) })
      )
    );
    const toggle = el("checkbox", { className: "nyx-switch" });
    toggle.checked = style.enabled !== false;
    toggle.setAttribute("aria-label", style.name);
    toggle.addEventListener("command", () => {
      if (mine) {
        NyxSiteKit.updateStyle(style.id, { enabled: toggle.checked });
      } else {
        NyxSiteKit.setBuiltinEnabled(style.id, toggle.checked);
      }
    });
    row.append(toggle);
    if (mine) {
      const more = el("button", { className: "nyx-icon-btn" });
      more.setAttribute("image", "chrome://browser/content/nyx/icons/more.svg");
      more.addEventListener("command", () => this.openEditor(style.id, true));
      row.append(more);
    }
    row.addEventListener("click", event => {
      if (event.target.closest("checkbox, button")) {
        return;
      }
      this.openEditor(style.id, mine);
    });
    return row;
  },

  async openEditor(id, mine) {
    const { builtin, mine: mineList } = await NyxSiteKit.styles();
    const style = mine ? mineList.find(s => s.id === id) : builtin.find(s => s.id === id);
    if (!style) {
      return;
    }
    let source = style.source || "";
    if (!mine && !source) {
      const entry = NyxSiteStyles.BUILTIN.find(s => s.id === id);
      if (entry) {
        try {
          source = await (await fetch(`chrome://browser/content/nyx/sitestyles/styles/${entry.file}/catppuccin.user.less`)).text();
        } catch (error) {
          console.error("Browser: couldn't read the built-in style", error);
        }
      }
    }
    this.editing = { id, mine: !!mine };
    this.draft = source;
    document.getElementById("nyxStylesEditorName").value = style.name;
    document.getElementById("nyxStylesEditorName").readOnly = !mine;
    document.getElementById("nyxStylesEditorEnabled").checked = style.enabled !== false;
    const metaEl = document.getElementById("nyxStylesEditorMeta");
    if (mine) {
      metaEl.removeAttribute("data-l10n-id");
      metaEl.textContent = style.meta?.version ? `v${style.meta.version}` : "";
      if (!style.meta?.version) {
        document.l10n.setAttributes(metaEl, "nyx-styles-yours");
      }
    } else {
      document.l10n.setAttributes(metaEl, "nyx-styles-browser");
    }
    document.getElementById("nyxStylesEditorIcon").textContent = style.name.charAt(0).toUpperCase();
    this.showOptions(style);
    this.showApplies(style);
    document.getElementById("nyxStylesSave").hidden = !mine;
    document.getElementById("nyxStylesUndo").hidden = !mine;
    gotoPref("paneNyxStyles-edit");
    this.view = await codeMirror(document.getElementById("nyxStylesCode"), {
      doc: source || "/* ==UserStyle==\n@name New style\n==/UserStyle== */\n",
      language: "css",
      readOnly: !mine,
    });
  },

  showApplies(style) {
    const box = document.getElementById("nyxStylesApplies");
    box.replaceChildren();
    const domains = [...new Set((style.sections || []).flatMap(s => s.domains || []))];
    const prefixes = [...new Set((style.sections || []).flatMap(s => s.urlPrefixes || []))];
    if (!domains.length && !prefixes.length && style.hosts) {
      for (const host of style.hosts) {
        box.append(el("hbox", { className: "nyx-row", align: "center" },
          el("vbox", { className: "nyx-row-text", flex: "1" }, el("label", { value: host }), el("description", { className: "nyx-row-note", "data-l10n-id": "nyx-styles-domain" }))
        ));
      }
      return;
    }
    for (const domain of domains) {
      box.append(el("hbox", { className: "nyx-row", align: "center" },
        el("vbox", { className: "nyx-row-text", flex: "1" }, el("label", { value: domain }), el("description", { className: "nyx-row-note", "data-l10n-id": "nyx-styles-domain" }))
      ));
    }
    for (const prefix of prefixes) {
      box.append(el("hbox", { className: "nyx-row", align: "center" },
        el("vbox", { className: "nyx-row-text", flex: "1" }, el("label", { value: prefix }), el("description", { className: "nyx-row-note", "data-l10n-id": "nyx-styles-prefix" }))
      ));
    }
  },

  showOptions(style) {
    const box = document.getElementById("nyxStylesOptions");
    box.replaceChildren();
    const vars = style.vars || style.meta?.vars || {};
    const values = style.values || {};
    if (!Object.keys(vars).length) {
      box.append(el("description", { className: "nyx-row-note", "data-l10n-id": "nyx-styles-no-options" }));
      return;
    }
    for (const [name, option] of Object.entries(vars)) {
      const row = el("hbox", { className: "nyx-row", align: "center" });
      row.append(el("vbox", { className: "nyx-row-text", flex: "1" }, el("label", { value: option.label || name })));
      const current = values[name] ?? option.default;
      if (option.type === "checkbox") {
        const toggle = el("checkbox", { className: "nyx-switch" });
        toggle.checked = current === "1" || current === true;
        toggle.addEventListener("command", () => this.setVar(name, toggle.checked ? "1" : "0"));
        row.append(toggle);
      } else if (option.type === "select" || option.type === "dropdown") {
        const list = el("menulist");
        const popup = el("menupopup");
        for (const choice of option.options || []) {
          popup.append(el("menuitem", { value: choice.name, label: choice.label }));
        }
        list.append(popup);
        list.value = current;
        list.addEventListener("command", () => this.setVar(name, list.value));
        row.append(list);
      } else if (option.type === "range" || option.type === "number") {
        const min = option.min ?? 0;
        const max = option.max ?? 100;
        const step = option.step ?? 1;
        const unit = option.unit || "";
        const bar = el("html:input", {
          type: "range",
          className: "nyx-bar",
          min: String(min),
          max: String(max),
          step: String(step),
          value: String(current ?? option.default ?? min),
        });
        const shown = el("html:span", { className: "nyx-bar-value", text: `${bar.value}${unit}` });
        bar.addEventListener("input", () => {
          shown.textContent = `${bar.value}${unit}`;
        });
        bar.addEventListener("change", () => this.setVar(name, bar.value));
        row.append(bar, shown);
      } else {
        const field = el("html:input", { value: String(current), className: "nyx-var-field" });
        field.addEventListener("change", () => this.setVar(name, field.value));
        row.append(field);
      }
      box.append(row);
    }
  },

  async setVar(name, value) {
    if (!this.editing) {
      return;
    }
    if (this.editing.mine) {
      const style = (await NyxSiteKit.styles()).mine.find(s => s.id === this.editing.id);
      await NyxSiteKit.updateStyle(this.editing.id, { values: { ...style.values, [name]: value } });
    } else {
      await NyxSiteKit.setBuiltinValues(this.editing.id, { ...NyxSiteKit.builtinValues(this.editing.id), [name]: value });
    }
  },

  async save() {
    if (!this.editing?.mine || !this.view) {
      return;
    }
    const source = this.view.state.doc.toString();
    const name = document.getElementById("nyxStylesEditorName").value.trim();
    await NyxSiteKit.updateStyle(this.editing.id, { source, name: name || undefined });
    this.draft = source;
    document.l10n.setAttributes(document.getElementById("nyxStylesSaved"), "nyx-styles-saved");
  },

  undo() {
    if (this.view && this.draft != null) {
      this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: this.draft } });
    }
  },

  async create() {
    const style = await NyxSiteKit.addStyle(`/* ==UserStyle==\n@name New style\n@preprocessor default\n==/UserStyle== */\n\n@-moz-document domain("example.com") {\n  body { }\n}\n`);
    await this.openEditor(style.id, true);
  },

  async import() {
    const [file] = await pickFile({ accept: ".json,.user.css,.user.less,application/json" });
    if (!file) {
      return;
    }
    const text = await readFile(file);
    if (file.name.endsWith(".json")) {
      const json = JSON.parse(text);
      const preview = previewStylus(json);
      const ok = Services.prompt.confirm(
        window,
        await document.l10n.formatValue("nyx-styles-import-title"),
        await document.l10n.formatValue("nyx-styles-import-confirm", { count: preview.length })
      );
      if (!ok) {
        return;
      }
      const result = await NyxSiteKit.importStylus(json);
      Services.prompt.alert(window, await document.l10n.formatValue("nyx-styles-import-title"), await document.l10n.formatValue("nyx-styles-import-done", { count: result.added }));
    } else {
      await NyxSiteKit.addStyle(text, { origin: file.name });
    }
    this.show();
  },
};

// ---- Scripts ----

var gNyxScriptsPane = {
  editing: null,
  view: null,
  draft: "",

  init() {
    document.getElementById("nyxScriptsImport").addEventListener("command", () => this.import());
    document.getElementById("nyxScriptsNew").addEventListener("command", () => this.create());
    document.getElementById("nyxScriptsBack").addEventListener("command", () => gotoPref("paneNyxScripts"));
    document.getElementById("nyxScriptsSave").addEventListener("command", () => this.save());
    document.getElementById("nyxScriptsUndo").addEventListener("command", () => this.undo());
    document.getElementById("nyxScriptsCheck").addEventListener("command", () => this.checkAll());
    document.getElementById("nyxScriptsFind").addEventListener("input", event => this.filter(event.target.value));
    document.getElementById("nyxScriptsTabCode").addEventListener("command", () => this.tab("code"));
    document.getElementById("nyxScriptsTabValues").addEventListener("command", () => this.tab("values"));
    document.getElementById("nyxScriptsValueClear").addEventListener("command", () => this.clearValues());
    document.getElementById("nyxScriptsEditorEnabled").addEventListener("command", event => {
      if (this.editing) {
        NyxSiteKit.updateScript(this.editing, { enabled: event.target.checked });
      }
    });
    document.addEventListener("paneshown", event => {
      if (event.detail.category === "paneNyxScripts" && !event.detail.subcategory) {
        this.handleSubcategory(null);
        this.show();
      }
    });
    Services.obs.addObserver(this, SITEKIT_TOPIC);
    window.addEventListener("unload", () => Services.obs.removeObserver(this, SITEKIT_TOPIC), { once: true });
  },

  observe() {
    if (!document.documentElement.hasAttribute("nyx-scripts-edit")) {
      this.show();
    }
  },

  handleSubcategory(sub) {
    const edit = sub === "edit";
    document.documentElement.toggleAttribute("nyx-scripts-edit", edit);
    document.getElementById("nyxScriptsList").hidden = edit;
    document.getElementById("nyxScriptsEditor").hidden = !edit;
    return edit;
  },

  async show() {
    await NyxSiteKit.init();
    const scripts = await NyxSiteKit.scripts();
    const box = document.getElementById("nyxScriptsRows");
    box.replaceChildren();
    if (!scripts.length) {
      box.append(el("description", { className: "nyx-row-note", "data-l10n-id": "nyx-scripts-none" }));
      return;
    }
    for (const script of scripts) {
      box.append(this.row(script));
    }
    this.filter(document.getElementById("nyxScriptsFind").value);
  },

  row(script) {
    const sites = [...(script.meta.match || []), ...(script.meta.include || [])].slice(0, 2).join(" · ");
    const row = el("hbox", { className: "nyx-row nyx-script-row", align: "center", "data-name": script.meta.name.toLowerCase() });
    row.append(
      el("html:span", { className: "nyx-style-ico", text: (script.meta.name || "?").charAt(0).toUpperCase() }),
      el("vbox", { className: "nyx-row-text", flex: "1" },
        el("label", { value: script.meta.name }),
        el("description", { className: "nyx-row-note", text: `${sites}${script.meta.version ? ` · v${script.meta.version}` : ""}` })
      )
    );
    const toggle = el("checkbox", { className: "nyx-switch" });
    toggle.checked = script.enabled;
    toggle.addEventListener("command", () => NyxSiteKit.updateScript(script.id, { enabled: toggle.checked }));
    row.append(toggle);
    row.addEventListener("dblclick", () => this.openEditor(script.id));
    return row;
  },

  filter(query) {
    const q = query.trim().toLowerCase();
    for (const row of document.querySelectorAll(".nyx-script-row")) {
      row.hidden = q && !row.dataset.name.includes(q);
    }
  },

  async openEditor(id) {
    const script = (await NyxSiteKit.scripts()).find(s => s.id === id);
    if (!script) {
      return;
    }
    this.editing = id;
    this.draft = script.source;
    document.getElementById("nyxScriptsEditorName").value = script.meta.name;
    document.getElementById("nyxScriptsEditorEnabled").checked = script.enabled;
    {
      const parts = [script.meta.version && `v${script.meta.version}`, script.origin].filter(Boolean);
      const metaEl = document.getElementById("nyxScriptsEditorMeta");
      if (script.updateUrl) {
        document.l10n.formatValue("nyx-scripts-meta-updates").then(word => {
          metaEl.textContent = [...parts, word].filter(Boolean).join(" · ");
        });
      } else {
        metaEl.removeAttribute("data-l10n-id");
        metaEl.textContent = parts.join(" · ") || "—";
      }
    }
    document.getElementById("nyxScriptsEditorIcon").textContent = script.meta.name.charAt(0).toUpperCase();
    this.showGrants(script);
    this.tab("code");
    gotoPref("paneNyxScripts-edit");
    this.view = await codeMirror(document.getElementById("nyxScriptsCode"), { doc: script.source, language: "javascript" });
  },

  showGrants(script) {
    const box = document.getElementById("nyxScriptsGrants");
    box.replaceChildren();
    const grants = script.meta.grant.filter(g => g !== "none");
    const rows = [
      [script.meta.match.concat(script.meta.include).join(", ") || "—", "nyx-scripts-grant-sites"],
      [grants.length ? grants.join(", ") : "None", "nyx-scripts-grant-api"],
      [(script.meta.connect || []).join(", "), "nyx-scripts-grant-connect"],
    ];
    for (const [value, note] of rows) {
      if (!value && note === "nyx-scripts-grant-connect") {
        continue;
      }
      box.append(el("hbox", { className: "nyx-row", align: "center" },
        el("vbox", { className: "nyx-row-text", flex: "1" },
          el("label", { value: value || "—" }),
          el("description", { className: "nyx-row-note", "data-l10n-id": note })
        )
      ));
    }
  },

  async tab(which) {
    const code = which === "code";
    document.getElementById("nyxScriptsCodeView").hidden = !code;
    document.getElementById("nyxScriptsValuesView").hidden = code;
    document.getElementById("nyxScriptsTabCode").toggleAttribute("selected", code);
    document.getElementById("nyxScriptsTabValues").toggleAttribute("selected", !code);
    if (!code) {
      await this.showValues();
    }
  },

  async showValues() {
    const values = NyxSiteKit.values(this.editing);
    const box = document.getElementById("nyxScriptsValues");
    box.replaceChildren();
    const keys = Object.keys(values);
    if (!keys.length) {
      box.append(el("description", { className: "nyx-row-note", "data-l10n-id": "nyx-scripts-values-empty" }));
      return;
    }
    for (const key of keys) {
      const row = el("hbox", { className: "nyx-row", align: "center" });
      row.append(
        el("label", { className: "nyx-mono", value: key, flex: "1" }),
        el("label", { className: "nyx-mono nyx-dim", value: JSON.stringify(values[key]), flex: "2" })
      );
      const remove = el("button", { className: "nyx-icon-btn" });
      remove.setAttribute("image", "chrome://browser/content/nyx/icons/close.svg");
      remove.addEventListener("command", async () => {
        const next = { ...NyxSiteKit.values(this.editing) };
        delete next[key];
        await NyxSiteKit.setValues(this.editing, next);
        this.showValues();
      });
      row.append(remove);
      box.append(row);
    }
  },

  async clearValues() {
    if (!this.editing) {
      return;
    }
    await NyxSiteKit.setValues(this.editing, {});
    this.showValues();
  },

  async save() {
    if (!this.editing || !this.view) {
      return;
    }
    await NyxSiteKit.updateScript(this.editing, { source: this.view.state.doc.toString() });
    this.draft = this.view.state.doc.toString();
  },

  undo() {
    if (this.view && this.draft != null) {
      this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: this.draft } });
    }
  },

  async create() {
    const script = await NyxSiteKit.addScript(`// ==UserScript==\n// @name         New script\n// @match        https://example.com/*\n// @grant        none\n// ==/UserScript==\n\n(function () {\n  "use strict";\n})();\n`);
    await this.openEditor(script.id);
  },

  async import() {
    const [file] = await pickFile({ accept: ".zip,.json,.user.js,application/json,application/zip" });
    if (!file) {
      return;
    }
    const data = await readFile(file);
    if (file.name.endsWith(".user.js")) {
      await NyxSiteKit.addScript(data, { origin: file.name });
    } else {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new TextEncoder().encode(data);
      const preview = previewTampermonkey(bytes);
      const ok = Services.prompt.confirm(
        window,
        await document.l10n.formatValue("nyx-scripts-import-title"),
        await document.l10n.formatValue("nyx-scripts-import-confirm", { count: preview.length })
      );
      if (!ok) {
        return;
      }
      const result = await NyxSiteKit.importTampermonkey(bytes);
      Services.prompt.alert(window, await document.l10n.formatValue("nyx-scripts-import-title"), await document.l10n.formatValue("nyx-scripts-import-done", { count: result.added }));
    }
    this.show();
  },

  async checkAll() {
    const scripts = await NyxSiteKit.scripts();
    let updated = 0;
    for (const script of scripts) {
      try {
        if ((await NyxSiteKit.checkUpdate("script", script.id)) === "updated") {
          updated++;
        }
      } catch {}
    }
    Services.prompt.alert(window, await document.l10n.formatValue("nyx-scripts-check"), await document.l10n.formatValue("nyx-scripts-check-done", { count: updated }));
    this.show();
  },
};

// ---- YouTube ----

var gNyxYouTubePane = {
  init() {
    const list = document.getElementById("nyxYouTubeVolume");
    list.value = String(Services.prefs.getIntPref("nyx.youtube.volume", -1));
    list.addEventListener("command", () => Services.prefs.setIntPref("nyx.youtube.volume", Number(list.value)));
  },
};

// ---- Selection search: Swift Selection Search import ----

const gNyxSelectionImport = {
  init() {
    const button = document.getElementById("nyxSelectionImport");
    if (!button) {
      return;
    }
    button.addEventListener("command", () => this.import());
  },

  async import() {
    let settings = await NyxSelectionImport.readFromProfile();
    if (!settings) {
      const [file] = await pickFile({ accept: ".json,application/json" });
      if (!file) {
        return;
      }
      settings = JSON.parse(await readFile(file));
    } else {
      const useProfile = Services.prompt.confirm(
        window,
        await document.l10n.formatValue("nyx-selection-import"),
        await document.l10n.formatValue("nyx-selection-import-profile")
      );
      if (!useProfile) {
        const [file] = await pickFile({ accept: ".json,application/json" });
        if (!file) {
          return;
        }
        settings = JSON.parse(await readFile(file));
      }
    }
    const preview = await NyxSelectionImport.preview(settings);
    const toAdd = preview.engines.filter(e => e.status !== "existing").length;
    const lines = [
      await document.l10n.formatValue("nyx-selection-import-preview", { count: toAdd, total: preview.engines.length }),
      ...preview.engines.filter(e => e.fixed).map(e => `• ${e.name}: fixed`),
      ...preview.skipped.filter(s => s.reason === "variables" || s.reason === "scheme").slice(0, 5).map(s => `• ${s.name}: skipped`),
    ];
    const ok = Services.prompt.confirm(window, await document.l10n.formatValue("nyx-selection-import"), lines.join("\n"));
    if (!ok) {
      return;
    }
    const result = await NyxSelectionImport.apply(preview);
    Services.prompt.alert(window, await document.l10n.formatValue("nyx-selection-import"), await document.l10n.formatValue("nyx-selection-import-done", { count: result.added }));
    gNyxSelectionPane.showEngines();
  },
};

// Hook SSS import into the Selection pane's init.
const _selectionInit = gNyxSelectionPane.init.bind(gNyxSelectionPane);
gNyxSelectionPane.init = function () {
  _selectionInit();
  gNyxSelectionImport.init();
};
