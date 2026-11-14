/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser's site styles and scripts: Stylus and Tampermonkey, kept by Browser itself. Everything
// lives in the profile (nyx-sitekit.json, and the scripts' values in nyx-sitekit-values.json).
// Pages get what's on through shared data, which every process has before a page's first
// script runs (NyxSiteChild), so a style is there from the first paint.

import { parseUserScript, parseUserStyle, documentSections, varValue, connectAllows } from "resource://nyx/actors/NyxSiteCode.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
  NyxTheme: "chrome://browser/content/nyx/NyxTheme.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const FILE = "nyx-sitekit.json";
const VALUES_FILE = "nyx-sitekit-values.json";
// The shared data pages read: styles and scripts that are on, and the theme's tokens.
export const SHARED_KEY = "nyx:sitekit";
// Each script's values, under their own key, so a value written doesn't resend every script.
export const valuesKey = id => `nyx:sitekit:values:${id}`;
const TOPIC = "nyx-sitekit-changed";
const BIG_VALUES = 4 * 1024 * 1024;

const newId = () => Services.uuid.generateUUID().toString().slice(1, 9);
const now = () => Date.now();

class SiteKit {
  #data = null;
  #values = null;
  #loading = null;
  #saveTask = null;
  #valuesTask = null;
  // Browser's own styles, compiled for the current theme: [{id, name, hosts, sections, vars}].
  #builtin = [];
  #tokens = "";
  #unsubscribeTheme = null;

  get #path() {
    return PathUtils.join(PathUtils.profileDir, FILE);
  }

  get #valuesPath() {
    return PathUtils.join(PathUtils.profileDir, VALUES_FILE);
  }

  /** Reads the profile's styles and scripts once, publishes them, and follows the theme. */
  init() {
    this.#loading ??= this.#load();
    return this.#loading;
  }

  async #load() {
    const empty = { version: 1, styles: [], scripts: [], builtin: { off: [], values: {} } };
    try {
      this.#data = { ...empty, ...(await IOUtils.readJSON(this.#path)) };
    } catch {
      this.#data = empty;
    }
    try {
      this.#values = await IOUtils.readJSON(this.#valuesPath);
    } catch {
      this.#values = {};
    }
    this.#saveTask = new lazy.DeferredTask(() => IOUtils.writeJSON(this.#path, this.#data, { tmpPath: `${this.#path}.tmp` }), 500);
    this.#valuesTask = new lazy.DeferredTask(() => IOUtils.writeJSON(this.#valuesPath, this.#values, { tmpPath: `${this.#valuesPath}.tmp` }), 1000);
    for (const [id, values] of Object.entries(this.#values)) {
      Services.ppmm.sharedData.set(valuesKey(id), values);
    }
    IOUtils.profileBeforeChange.addBlocker("Browser: saving site styles and scripts", () => this.flush());
    this.#unsubscribeTheme = lazy.NyxTheme.subscribe(css => this.#themeChanged(css));
    this.#publish();
  }

  /** Writes anything still waiting, at shutdown. */
  async flush() {
    await this.#saveTask?.finalize();
    await this.#valuesTask?.finalize();
    this.#unsubscribeTheme?.();
  }

  #save() {
    this.#saveTask.arm();
    this.#publish();
    Services.obs.notifyObservers(null, TOPIC);
  }

  // ---- What pages see ----

  #themeChanged(css) {
    const tokens = [...css.matchAll(/(--nyx-[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)].map(([, name, value]) => `${name}: ${value.trim()};`);
    this.#tokens = tokens.length ? `:root {\n  ${tokens.join("\n  ")}\n}\n` : "";
    this.#builtinChanged?.();
    this.#publish();
  }

  // Set by Browser's own styles (NyxSiteStyles) to compile them again for a new theme.
  #builtinChanged = null;

  /**
   * Browser's own styles, compiled for the current theme. Called again after each theme change
   * by the module that compiles them.
   *
   * @param {Array} styles [{id, name, hosts, sections, vars}]
   * @param {Function} [recompile] Called after a theme change.
   */
  setBuiltin(styles, recompile) {
    this.#builtin = styles;
    if (recompile) {
      this.#builtinChanged = recompile;
    }
    this.#publish();
    Services.obs.notifyObservers(null, TOPIC);
  }

  #publish() {
    if (!this.#data) {
      return;
    }
    const off = new Set(this.#data.builtin.off);
    // A style of yours for a site turns Browser's off there, so the two don't fight.
    const replaced = new Set(this.#data.styles.filter(s => s.enabled && s.replaces).map(s => s.replaces));
    const styles = [
      ...this.#builtin.filter(s => !off.has(s.id) && !replaced.has(s.id)).map(s => ({ id: `nyx:${s.id}`, sections: s.sections, tokens: true })),
      ...this.#data.styles.filter(s => s.enabled && s.sections?.length).map(s => ({ id: s.id, sections: s.sections, tokens: true })),
    ];
    const scripts = this.#data.scripts
      .filter(s => s.enabled)
      .map(s => ({
        id: s.id,
        name: s.meta.name,
        meta: s.meta,
        code: s.source,
        requires: s.requires ?? [],
        resources: s.resources ?? {},
        uuid: s.uuid,
      }));
    Services.ppmm.sharedData.set(SHARED_KEY, { styles, scripts, tokens: this.#tokens });
    Services.ppmm.sharedData.flush();
  }

  // ---- Styles ----

  /** Browser's own styles, with whether each is on, and yours. */
  async styles() {
    await this.init();
    const off = new Set(this.#data.builtin.off);
    return {
      builtin: this.#builtin.map(s => ({ id: s.id, name: s.name, hosts: s.hosts, vars: s.vars ?? {}, values: this.#data.builtin.values[s.id] ?? {}, enabled: !off.has(s.id) })),
      mine: this.#data.styles.map(s => structuredClone(s)),
    };
  }

  /** Turns one of Browser's own styles on or off. */
  async setBuiltinEnabled(id, enabled) {
    await this.init();
    const off = new Set(this.#data.builtin.off);
    enabled ? off.delete(id) : off.add(id);
    this.#data.builtin.off = [...off];
    this.#save();
  }

  /** Changes one of Browser's own styles' options; it's compiled again with them. */
  async setBuiltinValues(id, values) {
    await this.init();
    this.#data.builtin.values[id] = values;
    this.#saveTask.arm();
    await this.#builtinChanged?.();
  }

  builtinValues(id) {
    return this.#data?.builtin.values[id] ?? {};
  }

  /**
   * Adds a style from its code: UserCSS (with a ==UserStyle== block) or plain CSS with
   * @-moz-document sections.
   *
   * @param {string} source
   * @param {object} [extra] name, enabled, values, updateUrl, origin, sections (Stylus's own)
   */
  async addStyle(source, extra = {}) {
    await this.init();
    const meta = parseUserStyle(source);
    const style = {
      id: newId(),
      name: extra.name || meta?.name || "New style",
      enabled: extra.enabled ?? true,
      source,
      meta,
      values: extra.values ?? {},
      updateUrl: extra.updateUrl ?? meta?.updateURL ?? "",
      origin: extra.origin ?? "",
      installed: now(),
      updated: now(),
      sections: [],
      error: "",
      replaces: "",
    };
    await this.#compile(style, extra.sections);
    style.replaces = this.#builtinFor(style);
    this.#data.styles.push(style);
    this.#save();
    return structuredClone(style);
  }

  /** Changes a style of yours: its code, name, switch, options or sites. */
  async updateStyle(id, change) {
    await this.init();
    const style = this.#data.styles.find(s => s.id === id);
    if (!style) {
      return null;
    }
    if ("source" in change) {
      style.source = change.source;
      style.meta = parseUserStyle(change.source);
      style.updated = now();
    }
    for (const key of ["name", "enabled", "values", "updateUrl"]) {
      if (key in change) {
        style[key] = change[key];
      }
    }
    if ("source" in change || "values" in change) {
      await this.#compile(style);
      style.replaces = this.#builtinFor(style);
    }
    this.#save();
    return structuredClone(style);
  }

  async removeStyle(id) {
    await this.init();
    this.#data.styles = this.#data.styles.filter(s => s.id !== id);
    this.#save();
  }

  /** Which of Browser's own styles a style of yours covers: the first whose sites it names. */
  #builtinFor(style) {
    const domains = new Set(style.sections.flatMap(s => s.domains));
    const prefixes = style.sections.flatMap(s => s.urlPrefixes);
    return this.#builtin.find(b => b.hosts.some(h => domains.has(h) || prefixes.some(p => p.includes(`//${h}`) || p.includes(`.${h}`))))?.id ?? "";
  }

  /**
   * Compiles a style's code into sections: its @var values put in, LESS compiled. Stylus's own
   * sections are used when there's no UserCSS to compile.
   */
  async #compile(style, given) {
    style.error = "";
    try {
      if (!style.meta && given?.length && !/@-moz-document/.test(style.source)) {
        style.sections = given;
        return;
      }
      style.sections = documentSections(await compileUserStyle(style.source, style.meta, style.values));
    } catch (error) {
      style.error = String(error?.message ?? error);
      style.sections ??= [];
    }
  }

  // ---- Scripts ----

  async scripts() {
    await this.init();
    return this.#data.scripts.map(s => ({ ...structuredClone(s), valueCount: Object.keys(this.#values[s.id] ?? {}).length }));
  }

  /**
   * Adds a userscript, fetching its @require and @resource files first. A script with the same
   * name and namespace is replaced, keeping its values and switch.
   *
   * @param {string} source
   * @param {object} [extra] enabled, values, origin, updateUrl
   */
  async addScript(source, extra = {}) {
    await this.init();
    const meta = parseUserScript(source);
    if (!meta) {
      throw new Error("This isn't a userscript: it has no ==UserScript== block.");
    }
    meta.name ||= "Untitled script";
    const old = this.#data.scripts.find(s => s.meta.name === meta.name && s.meta.namespace === meta.namespace);
    const script = {
      id: old?.id ?? newId(),
      uuid: old?.uuid ?? Services.uuid.generateUUID().toString().slice(1, -1),
      enabled: extra.enabled ?? old?.enabled ?? true,
      source,
      meta,
      origin: extra.origin ?? old?.origin ?? "",
      updateUrl: extra.updateUrl ?? meta.updateURL ?? meta.downloadURL ?? old?.updateUrl ?? "",
      installed: old?.installed ?? now(),
      updated: now(),
      requires: [],
      resources: {},
      error: "",
    };
    await this.#fetchFiles(script);
    if (old) {
      Object.assign(old, script);
    } else {
      this.#data.scripts.push(script);
    }
    if (extra.values) {
      this.#values[script.id] = { ...(this.#values[script.id] ?? {}), ...extra.values };
      this.#valuesChanged(script.id);
    }
    this.#save();
    return structuredClone(script);
  }

  async #fetchFiles(script) {
    const errors = [];
    script.requires = [];
    for (const url of script.meta.require) {
      try {
        script.requires.push(await fetchText(url));
      } catch (error) {
        errors.push(`@require ${url}: ${error.message}`);
      }
    }
    script.resources = {};
    for (const [name, url] of Object.entries(script.meta.resource)) {
      try {
        script.resources[name] = await fetchResource(url);
      } catch (error) {
        errors.push(`@resource ${name}: ${error.message}`);
      }
    }
    script.error = errors.join("\n");
  }

  async updateScript(id, change) {
    await this.init();
    const script = this.#data.scripts.find(s => s.id === id);
    if (!script) {
      return null;
    }
    if ("source" in change) {
      const meta = parseUserScript(change.source);
      if (!meta) {
        throw new Error("The ==UserScript== block is missing.");
      }
      const files = JSON.stringify([meta.require, meta.resource]) !== JSON.stringify([script.meta.require, script.meta.resource]);
      script.source = change.source;
      script.meta = meta;
      script.updated = now();
      if (files) {
        await this.#fetchFiles(script);
      }
    }
    for (const key of ["enabled", "updateUrl"]) {
      if (key in change) {
        script[key] = change[key];
      }
    }
    this.#save();
    return structuredClone(script);
  }

  async removeScript(id) {
    await this.init();
    this.#data.scripts = this.#data.scripts.filter(s => s.id !== id);
    delete this.#values[id];
    this.#valuesChanged(id);
    this.#save();
  }

  /** The script's id, if it's on and runs with these grants; for the parent actor's checks. */
  script(id) {
    return this.#data?.scripts.find(s => s.id === id && s.enabled) ?? null;
  }

  // ---- Script values ----

  values(id) {
    return structuredClone(this.#values?.[id] ?? {});
  }

  async setValues(id, values) {
    await this.init();
    this.#values[id] = values;
    this.#valuesChanged(id);
  }

  /** A page's GM_setValue or GM_deleteValue (value undefined). */
  setValue(id, key, value) {
    if (!this.#values || !this.script(id)) {
      return;
    }
    const values = (this.#values[id] ??= {});
    if (value === undefined) {
      delete values[key];
    } else {
      values[key] = value;
    }
    if (JSON.stringify(values).length > BIG_VALUES) {
      delete values[key];
      throw new Error("This script's values are over 4 MB.");
    }
    this.#valuesChanged(id);
  }

  #valuesChanged(id) {
    const values = this.#values[id];
    if (values && Object.keys(values).length) {
      Services.ppmm.sharedData.set(valuesKey(id), values);
    } else {
      delete this.#values[id];
      Services.ppmm.sharedData.delete(valuesKey(id));
    }
    this.#valuesTask.arm();
  }

  // ---- Requests a script makes ----

  /**
   * GM_xmlhttpRequest, from the parent, to the hosts the script's @connect names (and its own
   * page's site). Cookies for the target are sent unless the script asks for anonymous.
   */
  async request(id, pageUrl, details) {
    const script = this.script(id);
    if (!script || !script.meta.grant.some(g => g === "GM_xmlhttpRequest" || g === "GM.xmlHttpRequest" || g === "GM.xmlhttpRequest")) {
      throw new Error("This script didn't ask for GM_xmlhttpRequest.");
    }
    const url = new URL(details.url, pageUrl).href;
    if (!/^https?:/.test(url)) {
      throw new Error("Only http and https addresses.");
    }
    if (!connectAllows(["self", ...script.meta.connect], url, pageUrl)) {
      throw new Error(`${new URL(url).hostname} isn't in this script's @connect.`);
    }
    const controller = new AbortController();
    const timer = details.timeout ? lazy.setTimeout(() => controller.abort(), details.timeout) : 0;
    try {
      const response = await fetch(url, {
        method: details.method || "GET",
        headers: details.headers ?? {},
        body: details.data ?? undefined,
        credentials: details.anonymous ? "omit" : "include",
        redirect: "follow",
        signal: controller.signal,
      });
      const headers = [...response.headers].map(([k, v]) => `${k}: ${v}`).join("\r\n");
      const binary = details.responseType === "arraybuffer" || details.responseType === "blob";
      const result = {
        status: response.status,
        statusText: response.statusText,
        finalUrl: response.url,
        responseHeaders: headers,
        contentType: response.headers.get("content-type") ?? "",
      };
      if (binary) {
        result.bytes = new Uint8Array(await response.arrayBuffer());
      } else {
        result.responseText = await response.text();
      }
      return result;
    } finally {
      if (timer) {
        lazy.clearTimeout(timer);
      }
    }
  }

  // ---- Updates ----

  /**
   * Checks one style or script for a newer version where it came from. Returns "updated",
   * "current" or throws.
   */
  async checkUpdate(kind, id) {
    await this.init();
    if (kind === "script") {
      const script = this.#data.scripts.find(s => s.id === id);
      const url = script?.meta.downloadURL || script?.updateUrl || script?.meta.updateURL;
      if (!url) {
        throw new Error("It doesn't say where its updates are.");
      }
      let source = await fetchText(url);
      let meta = parseUserScript(source);
      if (meta && !source.includes("==/UserScript==\n") && url.endsWith(".meta.js") && script.meta.downloadURL) {
        source = await fetchText(script.meta.downloadURL);
        meta = parseUserScript(source);
      }
      if (!meta || Services.vc.compare(meta.version || "0", script.meta.version || "0") <= 0) {
        return "current";
      }
      if (url.endsWith(".meta.js")) {
        source = await fetchText(script.meta.downloadURL || url.replace(/\.meta\.js$/, ".user.js"));
      }
      await this.addScript(source, { origin: script.origin });
      return "updated";
    }
    const style = this.#data.styles.find(s => s.id === id);
    if (!style?.updateUrl) {
      throw new Error("It doesn't say where its updates are.");
    }
    const source = await fetchText(style.updateUrl);
    const meta = parseUserStyle(source);
    if (meta && style.meta && Services.vc.compare(meta.version || "0", style.meta.version || "0") <= 0) {
      return "current";
    }
    if (!meta && source === style.source) {
      return "current";
    }
    await this.updateStyle(id, { source });
    return "updated";
  }

  // ---- Imports ----

  /**
   * A Stylus backup (its JSON export): settings first, then styles. UserCSS styles are compiled
   * again from their code, since an export may leave their sections empty.
   *
   * @returns {Promise<{added: number, failed: string[]}>}
   */
  async importStylus(json, { only } = {}) {
    const list = (Array.isArray(json) ? json : [json]).filter(s => s && typeof s === "object" && (s.sections || s.sourceCode));
    const result = { added: 0, failed: [] };
    for (const style of list) {
      if (only && !only.includes(style.name)) {
        continue;
      }
      try {
        const values = Object.fromEntries(Object.entries(style.usercssData?.vars ?? {}).map(([name, v]) => [name, v.value ?? v.default]));
        const source = style.sourceCode || sectionsToCss(style.sections ?? []);
        await this.addStyle(source, {
          name: style.name,
          enabled: style.enabled !== false,
          values,
          updateUrl: style.updateUrl ?? "",
          origin: "stylus",
          sections: style.sourceCode ? undefined : normalizeSections(style.sections),
        });
        result.added++;
      } catch (error) {
        result.failed.push(`${style.name}: ${error.message}`);
      }
    }
    return result;
  }

  /** What a Stylus backup holds, for the import preview. */
  static previewStylus(json) {
    return (Array.isArray(json) ? json : []).filter(s => s?.sections || s?.sourceCode).map(s => {
      const meta = s.sourceCode ? parseUserStyle(s.sourceCode) : null;
      const sections = s.sourceCode ? [] : normalizeSections(s.sections);
      return {
        name: s.name,
        enabled: s.enabled !== false,
        preprocessor: meta?.preprocessor ?? "css",
        options: Object.keys(meta?.vars ?? {}).length,
        domains: [...new Set((meta ? documentSections(s.sourceCode) : sections).flatMap(x => x.domains))],
      };
    });
  }

  /**
   * A Tampermonkey export: its zip (each script as NAME.user.js, with NAME.options.json and
   * NAME.storage.json beside it) or its JSON (`scripts: [{name, source (base64), enabled, storage}]`).
   *
   * @param {Uint8Array} bytes
   */
  async importTampermonkey(bytes, { only } = {}) {
    const result = { added: 0, failed: [] };
    for (const entry of readTampermonkey(bytes)) {
      if (only && !only.includes(entry.name)) {
        continue;
      }
      try {
        await this.addScript(entry.source, { enabled: entry.enabled, values: entry.values, origin: "tampermonkey" });
        result.added++;
      } catch (error) {
        result.failed.push(`${entry.name}: ${error.message}`);
      }
    }
    return result;
  }

  static previewTampermonkey(bytes) {
    return readTampermonkey(bytes).map(e => {
      const meta = parseUserScript(e.source);
      return { name: e.name, enabled: e.enabled, values: Object.keys(e.values ?? {}).length, sites: [...(meta?.match ?? []), ...(meta?.include ?? [])], connect: meta?.connect ?? [] };
    });
  }
}

// ---- Compiling a style ----

/**
 * A UserCSS style's code with its @var values: LESS compiled with them as variables; plain CSS
 * ("default" preprocessor) with them as custom properties on :root, as Stylus does. Code without
 * a ==UserStyle== block is used as it is.
 */
export async function compileUserStyle(source, meta, values = {}) {
  if (!meta) {
    return source;
  }
  const vars = Object.fromEntries(Object.entries(meta.vars).map(([name, option]) => [name, varValue(option, values[name] ?? option.default)]));
  const body = source.replace(/\/\*\s*==UserStyle==[\s\S]*?==\/UserStyle==\s*\*\//, "");
  switch (meta.preprocessor) {
    case "less": {
      const { NyxLess } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxLess.sys.mjs");
      const header = Object.entries(vars).map(([name, value]) => `@${name}: ${lessValue(meta.vars[name], value)};`).join("\n");
      return NyxLess.render(`${header}\n${body}`);
    }
    case "stylus":
      throw new Error("Styles written in Stylus's own language aren't supported; LESS and CSS are.");
    case "uso":
      return body.replace(/\/\*\[\[([\w-]+)\]\]\*\//g, (whole, name) => vars[name] ?? whole);
    default: {
      const root = Object.keys(vars).length ? `:root {\n${Object.entries(vars).map(([name, value]) => `  --${name}: ${value};`).join("\n")}\n}\n` : "";
      return root ? injectIntoSections(body, root) : body;
    }
  }
}

/** A value as LESS needs it: text options quoted unless they're already CSS. */
function lessValue(option, value) {
  if (option.type === "text" && !/^[\w#.-]+$/.test(value)) {
    return `~"${value.replace(/"/g, '\\"')}"`;
  }
  return value === "" ? '~""' : value;
}

/** Custom properties at the top of each @-moz-document section and of the code outside them. */
function injectIntoSections(css, root) {
  return `${root}${css.replace(/(@-moz-document[^{]*\{)/g, `$1\n${root}`)}`;
}

/** Stylus's sections as one stylesheet with @-moz-document blocks. */
function sectionsToCss(sections) {
  return sections
    .map(s => {
      const rules = [
        ...(s.urls ?? []).map(u => `url("${u}")`),
        ...(s.urlPrefixes ?? []).map(u => `url-prefix("${u}")`),
        ...(s.domains ?? []).map(d => `domain("${d}")`),
        ...(s.regexps ?? []).map(r => `regexp("${r.replace(/\\/g, "\\\\")}")`),
      ];
      return rules.length ? `@-moz-document ${rules.join(", ")} {\n${s.code}\n}` : s.code;
    })
    .join("\n\n");
}

function normalizeSections(sections = []) {
  return sections.map(s => ({ code: s.code ?? "", domains: s.domains ?? [], urls: s.urls ?? [], urlPrefixes: s.urlPrefixes ?? [], regexps: s.regexps ?? [] }));
}

// ---- Files ----

async function fetchText(url) {
  if (!/^https?:/.test(url)) {
    throw new Error("Only http and https addresses.");
  }
  const response = await fetch(url, { credentials: "omit", cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchResource(url) {
  if (!/^https?:/.test(url)) {
    throw new Error("Only http and https addresses.");
  }
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const type = response.headers.get("content-type") || "application/octet-stream";
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { url, type, text: new TextDecoder().decode(bytes), dataUrl: `data:${type};base64,${btoa(binary)}` };
}

/** Tampermonkey's zip or JSON export, as [{name, source, enabled, values}]. */
function readTampermonkey(bytes) {
  const decoder = new TextDecoder();
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return readTampermonkeyZip(bytes);
  }
  const json = JSON.parse(decoder.decode(bytes));
  return (json.scripts ?? []).map(s => {
    let source = s.source ?? "";
    try {
      source = decoder.decode(Uint8Array.from(atob(source), c => c.charCodeAt(0)));
    } catch {}
    return { name: s.name, source, enabled: s.enabled !== false, values: s.storage?.data ?? {} };
  });
}

function readTampermonkeyZip(bytes) {
  const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append("nyx-tampermonkey.zip");
  file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
  const stream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(Ci.nsIFileOutputStream);
  stream.init(file, -1, 0o600, 0);
  const binary = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(Ci.nsIBinaryOutputStream);
  binary.setOutputStream(stream);
  binary.writeByteArray(bytes);
  binary.close();
  const zip = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
  const read = name => {
    const input = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
    input.init(zip.getInputStream(name));
    const text = input.readBytes(input.available());
    input.close();
    return new TextDecoder().decode(Uint8Array.from(text, c => c.charCodeAt(0)));
  };
  const scripts = [];
  try {
    zip.open(file);
    for (const name of zip.findEntries("*.user.js")) {
      const base = name.slice(0, -".user.js".length);
      let options = {};
      let storage = {};
      try {
        options = JSON.parse(read(`${base}.options.json`));
      } catch {}
      try {
        storage = JSON.parse(read(`${base}.storage.json`));
      } catch {}
      scripts.push({ name: base.split("/").pop(), source: read(name), enabled: options.enabled !== false, values: storage.data ?? {} });
    }
  } finally {
    zip.close();
    file.remove(false);
  }
  return scripts;
}

export const NyxSiteKit = new SiteKit();
export const previewStylus = json => SiteKit.previewStylus(json);
export const previewTampermonkey = bytes => SiteKit.previewTampermonkey(bytes);
export const SITEKIT_TOPIC = TOPIC;
