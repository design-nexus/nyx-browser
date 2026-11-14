/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Site styles and scripts as text: their metadata blocks, a style's @-moz-document sections, and
// which addresses each one is for. Plain functions, used by the store (NyxSiteKit) and by every
// page (NyxSiteChild).

/** The lines between `start` and `end` (`// ==UserScript==`, `/* ==UserStyle==`) as [key, value]. */
function metaLines(source, start, end) {
  const from = source.indexOf(start);
  if (from < 0) {
    return null;
  }
  const to = source.indexOf(end, from + start.length);
  if (to < 0) {
    return null;
  }
  const lines = [];
  for (const line of source.slice(from + start.length, to).split(/\r?\n/)) {
    const match = /^\s*(?:\/\/)?\s*@([\w:.-]+)(?:\s+(.*?))?\s*$/.exec(line);
    if (match) {
      lines.push([match[1], match[2] ?? ""]);
    }
  }
  return lines;
}

const RUN_AT = { "document-start": "start", "document-body": "start", "document-end": "end", "document-idle": "idle", "context-menu": "idle" };

/**
 * A userscript's metadata. Null when there's no `// ==UserScript==` block.
 *
 * @param {string} source
 */
export function parseUserScript(source) {
  const lines = metaLines(source, "==UserScript==", "==/UserScript==");
  if (!lines) {
    return null;
  }
  const meta = {
    name: "",
    namespace: "",
    version: "",
    description: "",
    author: "",
    icon: "",
    homepage: "",
    updateURL: "",
    downloadURL: "",
    match: [],
    include: [],
    exclude: [],
    excludeMatch: [],
    grant: [],
    connect: [],
    require: [],
    resource: {},
    runAt: "idle",
    noframes: false,
    sandbox: "",
  };
  const locale = Services.locale.appLocaleAsBCP47;
  for (const [key, value] of lines) {
    const [base, lang] = key.split(":");
    switch (base) {
      case "name":
      case "description":
        // A translation for Browser's language wins over the plain value.
        if (!lang || lang === locale || lang === locale.split("-")[0]) {
          if (lang || !meta[base]) {
            meta[base] = value;
          }
        }
        break;
      case "namespace":
      case "version":
      case "author":
        meta[base] = value;
        break;
      case "icon":
      case "iconURL":
      case "defaulticon":
        meta.icon ||= value;
        break;
      case "homepage":
      case "homepageURL":
      case "website":
      case "source":
        meta.homepage ||= value;
        break;
      case "updateURL":
      case "downloadURL":
        meta[base] = value;
        break;
      case "match":
      case "include":
      case "exclude":
      case "grant":
      case "connect":
      case "require":
        if (value) {
          meta[base].push(value);
        }
        break;
      case "exclude-match":
        if (value) {
          meta.excludeMatch.push(value);
        }
        break;
      case "resource": {
        const [name, url] = value.split(/\s+/);
        if (name && url) {
          meta.resource[name] = url;
        }
        break;
      }
      case "run-at":
        meta.runAt = RUN_AT[value] ?? "idle";
        break;
      case "noframes":
        meta.noframes = true;
        break;
      case "sandbox":
        meta.sandbox = value;
        break;
    }
  }
  return meta;
}

/**
 * A UserCSS style's metadata, its @var options with their default values. Null when there's no
 * `/* ==UserStyle==` block.
 *
 * @param {string} source
 */
export function parseUserStyle(source) {
  const lines = metaLines(source, "==UserStyle==", "==/UserStyle==");
  if (!lines) {
    return null;
  }
  const meta = { name: "", namespace: "", version: "", description: "", author: "", homepage: "", updateURL: "", license: "", preprocessor: "default", vars: {} };
  for (const [key, value] of lines) {
    switch (key) {
      case "name":
      case "namespace":
      case "version":
      case "description":
      case "author":
      case "license":
      case "updateURL":
      case "preprocessor":
        meta[key] = value;
        break;
      case "homepageURL":
        meta.homepage = value;
        break;
      case "var":
      case "advanced": {
        const option = parseVar(value);
        if (option) {
          meta.vars[option.name] = option;
        }
        break;
      }
    }
  }
  return meta;
}

/**
 * One `@var type name "Label" default`, as Stylus reads it: text, color, checkbox, select (a list
 * or an object of choices, `*` marking the default), dropdown and image (choices of code), number
 * and range (`[default, min, max, step, unit]`).
 */
function parseVar(text) {
  const head = /^(\w+)\s+([\w-]+)\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)\s*([\s\S]*)$/.exec(text.trim());
  if (!head) {
    return null;
  }
  const [, type, name, rawLabel, rest] = head;
  const label = /^["']/.test(rawLabel) ? rawLabel.slice(1, -1) : rawLabel;
  const option = { type, name, label, default: "", options: null };
  const body = rest.trim();
  switch (type) {
    case "checkbox":
      option.default = body.startsWith("1") ? "1" : "0";
      break;
    case "number":
    case "range": {
      const list = jsonish(body);
      if (Array.isArray(list)) {
        const [value, min, max, step, unit] = list;
        Object.assign(option, { default: String(value ?? ""), min, max, step, unit: typeof unit === "string" ? unit : "" });
      } else {
        option.default = body;
      }
      break;
    }
    case "select":
    case "dropdown":
    case "image": {
      const choices = jsonish(body);
      option.options = [];
      if (Array.isArray(choices)) {
        // "id:Label", with a * after the id or the label marking the default.
        const choice = text => {
          const marked = /\*$/.test(text);
          const [id, shown] = text.replace(/\*$/, "").split(":");
          const name = id.replace(/\*$/, "");
          return { name, label: (shown ?? name).replace(/\*$/, ""), default: marked || id.endsWith("*") };
        };
        for (const item of choices) {
          const c = choice(String(item));
          option.options.push({ ...c, value: c.name });
        }
      } else if (choices && typeof choices === "object") {
        for (const [key, value] of Object.entries(choices)) {
          option.options.push({ ...choice(key), value: String(value) });
        }
      } else {
        // `dropdown name "Label" { a "A" <<<EOT … EOT; }`, Stylus's older form.
        for (const [, id, shown, value] of body.matchAll(/([\w-]+\*?)\s+"([^"]*)"\s+<<<EOT\s*([\s\S]*?)\s*EOT;/g)) {
          option.options.push({ name: id.replace(/\*$/, ""), label: shown, value, default: id.endsWith("*") });
        }
      }
      const picked = option.options.find(o => o.default) ?? option.options[0];
      option.default = picked?.name ?? "";
      break;
    }
    default:
      option.default = /^["']/.test(body) ? body.slice(1, -1) : body;
  }
  return option;
}

/** JSON, allowing the single quotes and trailing commas styles write. */
function jsonish(text) {
  try {
    return JSON.parse(text);
  } catch {}
  try {
    return JSON.parse(text.replace(/'/g, '"').replace(/,\s*([\]}])/g, "$1"));
  } catch {
    return null;
  }
}

/** The CSS value of an @var option's chosen value, as LESS or plain CSS sees it. */
export function varValue(option, value = option.default) {
  if (option.type === "checkbox") {
    return value === "1" || value === true ? "1" : "0";
  }
  if (option.options) {
    return (option.options.find(o => o.name === value) ?? option.options.find(o => o.default) ?? option.options[0])?.value ?? "";
  }
  if ((option.type === "number" || option.type === "range") && option.unit) {
    return `${value}${option.unit}`;
  }
  return String(value);
}

/**
 * A compiled stylesheet's sections: the code outside any `@-moz-document` (for every site) and
 * the code inside each one with its rules. Comments and strings are skipped while looking.
 *
 * @param {string} css
 * @returns {Array<{code: string, domains: string[], urls: string[], urlPrefixes: string[], regexps: string[]}>}
 */
export function documentSections(css) {
  const sections = [];
  let outside = "";
  let i = 0;
  while (i < css.length) {
    const at = findOutside(css, "@-moz-document", i);
    if (at < 0) {
      outside += css.slice(i);
      break;
    }
    outside += css.slice(i, at);
    const open = findOutside(css, "{", at);
    if (open < 0) {
      break;
    }
    const close = matchingBrace(css, open);
    const section = { code: css.slice(open + 1, close).trim(), domains: [], urls: [], urlPrefixes: [], regexps: [] };
    for (const match of css.slice(at + 14, open).matchAll(/(url-prefix|url|domain|regexp)\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*?))\s*\)/g)) {
      const [, fn, double, single, bare] = match;
      const value = unescapeCss(double ?? single ?? bare ?? "");
      ({ "url-prefix": section.urlPrefixes, url: section.urls, domain: section.domains, regexp: section.regexps })[fn].push(value);
    }
    if (section.code) {
      sections.push(section);
    }
    i = close + 1;
  }
  if (outside.replace(/\/\*[\s\S]*?\*\//g, "").trim()) {
    sections.unshift({ code: outside.trim(), domains: [], urls: [], urlPrefixes: [], regexps: [] });
  }
  return sections;
}

/** The index of `needle` at or after `from`, outside comments and strings; -1 if none. */
function findOutside(text, needle, from) {
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c === '"' || c === "'") {
      i = stringEnd(text, i);
    } else if (text.startsWith(needle, i)) {
      return i;
    }
  }
  return -1;
}

function stringEnd(text, start) {
  const quote = text[start];
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
    } else if (text[i] === quote || text[i] === "\n") {
      return i;
    }
  }
  return text.length;
}

function matchingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 1;
    } else if (c === '"' || c === "'") {
      i = stringEnd(text, i);
    } else if (c === "{") {
      depth++;
    } else if (c === "}" && --depth === 0) {
      return i;
    }
  }
  return text.length;
}

function unescapeCss(text) {
  return text.replace(/\\(.)/g, "$1");
}

/** Whether a style section is for this address. A section with no rules is for every site. */
export function sectionMatches(section, url) {
  const { domains = [], urls = [], urlPrefixes = [], regexps = [] } = section;
  if (!domains.length && !urls.length && !urlPrefixes.length && !regexps.length) {
    return true;
  }
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {}
  return (
    urls.includes(url) ||
    urlPrefixes.some(prefix => url.startsWith(prefix)) ||
    domains.some(domain => host === domain || host.endsWith(`.${domain}`)) ||
    regexps.some(source => wholeMatch(source, url))
  );
}

const regexpCache = new Map();
function cached(key, make) {
  let value = regexpCache.get(key);
  if (value === undefined) {
    try {
      value = make();
    } catch {
      value = null;
    }
    if (regexpCache.size > 2000) {
      regexpCache.clear();
    }
    regexpCache.set(key, value);
  }
  return value;
}

function wholeMatch(source, url) {
  return cached(`r:${source}`, () => new RegExp(`^(?:${source})$`, "i"))?.test(url) ?? false;
}

const escapeRegExp = text => text.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/**
 * A WebExtension match pattern (`*://*.example.com/*`, `<all_urls>`) as a regular expression.
 * Tampermonkey also takes `http*://` and a missing path, so those are allowed too.
 */
function matchPattern(pattern) {
  return cached(`m:${pattern}`, () => {
    if (pattern === "<all_urls>" || pattern === "*") {
      return /^(https?|file|ftp):\/\//;
    }
    const parts = /^(\*|https?|http\*|file|ftp|wss?):\/\/([^/]*)(\/.*)?$/.exec(pattern);
    if (!parts) {
      return null;
    }
    const [, scheme, host, path = "/*"] = parts;
    const schemes = scheme === "*" || scheme === "http*" ? "https?" : scheme;
    let hosts;
    if (host === "*" || host === "") {
      hosts = "[^/]*";
    } else if (host.startsWith("*.")) {
      hosts = `(?:[^/]*\\.)?${escapeRegExp(host.slice(2))}`;
    } else {
      // `example.*` (Tampermonkey's "any top-level domain") stays a wildcard.
      hosts = host.split("*").map(escapeRegExp).join("[^/]*");
    }
    return new RegExp(`^${schemes}://${hosts}(?::\\d+)?${path.split("*").map(escapeRegExp).join(".*")}$`, "i");
  });
}

/** An @include: a /regular expression/, or a glob where * is anything and `.tld` any top-level domain. */
function includeGlob(glob) {
  return cached(`g:${glob}`, () => {
    if (glob.length > 2 && glob.startsWith("/") && glob.endsWith("/")) {
      return new RegExp(glob.slice(1, -1), "i");
    }
    if (glob === "*") {
      return /^/;
    }
    const source = glob.split("*").map(escapeRegExp).join(".*").replace(/\\\.tld\b/g, "\\.[a-z.]{2,}");
    return new RegExp(`^${source}$`, "i");
  });
}

/** Whether a userscript runs on this address: an @match or @include, and no @exclude. */
export function scriptMatches(meta, url) {
  const hit = (list, make) => list.some(item => make(item)?.test(url));
  if (hit(meta.exclude ?? [], includeGlob) || hit(meta.excludeMatch ?? [], matchPattern)) {
    return false;
  }
  return hit(meta.match ?? [], matchPattern) || hit(meta.include ?? [], includeGlob);
}

/** Whether a userscript's @connect hosts allow a request to `url` from a page at `pageUrl`. */
export function connectAllows(connect, url, pageUrl) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  let pageHost = "";
  try {
    pageHost = new URL(pageUrl).hostname;
  } catch {}
  return connect.some(
    rule => rule === "*" || (rule === "self" && host === pageHost) || (rule === "localhost" && (host === "localhost" || host === "127.0.0.1")) || host === rule || host.endsWith(`.${rule}`)
  );
}
