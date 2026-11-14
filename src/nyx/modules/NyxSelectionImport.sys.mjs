/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Swift Selection Search's engines and settings, for Browser's selection search: from its
// backup file ("SSS settings backup (…).json") or from its data in this profile. A preview says
// what comes across and what can't (groups, separators, addresses with SSS's other variables);
// importing adds the engines as search engines and puts SSS's order, switches and settings in
// the nyx.selection prefs.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  IndexedDB: "resource://gre/modules/IndexedDB.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

const SSS_ID = "jid1-KdTtiCj6wxVAFA@jetpack";
// The user context Firefox keeps extensions' storage.local in.
const STORAGE_CONTEXT = -1 >>> 0;

const PREFS = {
  mode: "nyx.selection.mode",
  textbox: "nyx.selection.textbox",
  size: "nyx.selection.icon-size",
  open: "nyx.selection.open",
  hidden: "nyx.selection.hidden-engines",
  order: "nyx.selection.order",
  off: "nyx.selection.off-sites",
};
const list = pref => Services.prefs.getStringPref(pref, "").split(",").map(s => s.trim()).filter(Boolean);

const MODES = { auto: "selection", "hold-alt": "alt", "middle-mouse": "middle", off: "off" };
// SSS before 3.40 kept these as numbers.
const OLD_MODES = ["off", "auto", "keyboard", "hold-alt", "middle-mouse"];
const OPEN = {
  "this-tab": "current",
  "new-tab": "tab",
  "new-tab-next": "tab",
  "new-window": "tab",
  "new-bg-tab": "background",
  "new-bg-tab-next": "background",
  "new-bg-window": "background",
};

/**
 * SSS's data in this profile, if it was installed here: its storage.local, read from the
 * extension's own IndexedDB database (SSS needn't be on). Null when there's none.
 */
export async function readFromProfile() {
  let uuid;
  try {
    uuid = JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids", "{}"))[SSS_ID];
  } catch {}
  if (!uuid) {
    return null;
  }
  const folder = PathUtils.join(PathUtils.profileDir, "storage", "default", `moz-extension+++${uuid}^userContextId=${STORAGE_CONTEXT}`, "idb");
  if (!(await IOUtils.exists(folder))) {
    return null;
  }
  const principal = Services.scriptSecurityManager.createContentPrincipal(Services.io.newURI(`moz-extension://${uuid}/`), { userContextId: STORAGE_CONTEXT });
  const db = await lazy.IndexedDB.openForPrincipal(principal, "webExtensions-storage-local");
  try {
    if (!db.objectStoreNames.contains("storage-local-data")) {
      return null;
    }
    const store = db.objectStore("storage-local-data", "readonly");
    const [keys, values] = await Promise.all([store.getAllKeys(), store.getAll()]);
    const settings = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
    return settings.searchEngines ? settings : null;
  } finally {
    db.close();
  }
}

/**
 * What an import would do: the engines in SSS's order, each new, already here, fixed or left out
 * (with why), and SSS's settings as Browser's.
 *
 * @param {object} settings SSS's settings, as its backup file holds them.
 */
export async function preview(settings) {
  if (!Array.isArray(settings?.searchEngines)) {
    throw new Error("This isn't a Swift Selection Search backup.");
  }
  const existing = await lazy.SearchService.getEngines();
  const byName = new Map(existing.map(e => [e.name.toLowerCase(), e]));
  const byTemplate = new Map(existing.map(e => [template(e), e]));
  const engines = [];
  const skipped = [];
  for (const engine of settings.searchEngines) {
    const enabled = engine.isEnabled !== false;
    if (engine.type === "sss") {
      if (engine.id === "separator") {
        skipped.push({ name: "", reason: "separator" });
      } else {
        // Copy and Open as link: Browser's popup has its own.
        skipped.push({ name: engine.id, reason: "builtin" });
      }
      continue;
    }
    if (engine.type === "group") {
      skipped.push({ name: engine.name, reason: "group", count: engine.enginesUniqueIds?.length ?? 0 });
      continue;
    }
    if (engine.type === "browser-search-api") {
      const here = byName.get(engine.name?.toLowerCase());
      if (here) {
        engines.push({ name: here.name, enabled, existingId: here.id, status: "existing" });
      } else {
        skipped.push({ name: engine.name, reason: "missing" });
      }
      continue;
    }
    let url = String(engine.searchUrl ?? "").trim();
    let fixed = "";
    // An address whose query has no name, as `?={searchTerms}`: the usual name is q.
    if (/[?&]=\{searchTerms\}/.test(url)) {
      url = url.replace(/([?&])=\{searchTerms\}/, "$1q={searchTerms}");
      fixed = "no-name";
    }
    const others = (url.match(/\{[^}]*\}/g) ?? []).filter(v => v !== "{searchTerms}");
    if (!/^https?:\/\//i.test(url)) {
      skipped.push({ name: engine.name, reason: "scheme", url });
      continue;
    }
    if (others.length) {
      skipped.push({ name: engine.name, reason: "variables", variables: others });
      continue;
    }
    if (!url.includes("{searchTerms}")) {
      skipped.push({ name: engine.name, reason: "no-terms", url });
      continue;
    }
    const here = byTemplate.get(url) ?? byName.get(engine.name?.toLowerCase());
    const icon = settings.searchEnginesCache?.[engine.iconUrl] ?? (/^(https?|data):/.test(engine.iconUrl ?? "") ? engine.iconUrl : "");
    engines.push({
      name: engine.name || new URL(url).hostname,
      url,
      icon,
      enabled,
      fixed,
      existingId: here?.id ?? "",
      status: here ? "existing" : fixed ? "fixed" : "new",
    });
  }
  return { engines, skipped, settings: mapSettings(settings) };
}

/** An engine's search address, with {searchTerms} where the words go. */
function template(engine) {
  try {
    return decodeURIComponent(engine.getSubmission("{searchTerms}").uri.spec).replace(/%7BsearchTerms%7D/gi, "{searchTerms}");
  } catch {
    return "";
  }
}

/** SSS's settings as nyx.selection values; those with no match are left out. */
function mapSettings(settings) {
  const mapped = {};
  let mode = settings.popupOpenBehaviour;
  if (typeof mode === "number") {
    mode = OLD_MODES[mode];
  }
  if (MODES[mode]) {
    mapped.mode = MODES[mode];
  }
  if (typeof settings.showSelectionTextField === "boolean") {
    mapped.textbox = settings.showSelectionTextField;
  }
  if (typeof settings.popupItemSize === "number") {
    mapped.size = settings.popupItemSize <= 20 ? "small" : settings.popupItemSize <= 28 ? "medium" : "large";
  }
  if (OPEN[settings.mouseLeftButtonBehaviour]) {
    mapped.open = OPEN[settings.mouseLeftButtonBehaviour];
  }
  const hosts = String(settings.websiteBlocklist ?? "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      try {
        return new URL(/^[a-z]+:\/\//i.test(line) ? line : `https://${line}`).hostname.replace(/^\*\./, "");
      } catch {
        return "";
      }
    })
    .filter(host => host && !host.includes("*"));
  if (hosts.length) {
    mapped.offSites = [...new Set(hosts)];
  }
  return mapped;
}

/**
 * Imports what the preview showed: the chosen engines (by name) are added or kept, SSS's order
 * goes first in Browser's, its switched-off engines are hidden, and its settings are used when
 * `settings` is true.
 *
 * @returns {Promise<{added: number, failed: string[]}>}
 */
export async function apply(result, { engines: chosen, settings: withSettings = true } = {}) {
  const wanted = new Set(chosen ?? result.engines.map(e => e.name));
  const ids = [];
  const hidden = new Set(list(PREFS.hidden));
  const failed = [];
  let added = 0;
  for (const engine of result.engines) {
    if (!wanted.has(engine.name)) {
      continue;
    }
    let id = engine.existingId;
    if (!id) {
      try {
        const created = await lazy.SearchService.addUserEngine({ name: engine.name, url: engine.url });
        if (engine.icon) {
          await created.changeIcon(engine.icon).catch(() => created.updateFavicon?.());
        } else {
          created.updateFavicon?.();
        }
        id = created.id;
        added++;
      } catch (error) {
        failed.push(`${engine.name}: ${error.message}`);
        continue;
      }
    }
    ids.push(id);
    engine.enabled ? hidden.delete(id) : hidden.add(id);
  }
  const order = [...ids, ...list(PREFS.order).filter(id => !ids.includes(id))];
  Services.prefs.setStringPref(PREFS.order, order.join(","));
  Services.prefs.setStringPref(PREFS.hidden, [...hidden].join(","));
  if (withSettings) {
    const s = result.settings;
    if (s.mode) {
      Services.prefs.setStringPref(PREFS.mode, s.mode);
    }
    if (typeof s.textbox === "boolean") {
      Services.prefs.setBoolPref(PREFS.textbox, s.textbox);
    }
    if (s.size) {
      Services.prefs.setStringPref(PREFS.size, s.size);
    }
    if (s.open) {
      Services.prefs.setStringPref(PREFS.open, s.open);
    }
    if (s.offSites) {
      Services.prefs.setStringPref(PREFS.off, [...new Set([...list(PREFS.off), ...s.offSites])].join(","));
    }
  }
  return { added, failed };
}
