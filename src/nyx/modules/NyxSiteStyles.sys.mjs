/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser's own site styles: Catppuccin's (MIT), compiled with the current Nyx theme's
// colours. When the theme is a Catppuccin flavour, that palette is used as it is; otherwise
// a "nyx" flavour is built from the theme's tokens and put in Catppuccin's map.

import { documentSections, parseUserStyle, varValue } from "resource://nyx/actors/NyxSiteCode.sys.mjs";
import { NyxLess } from "chrome://browser/content/nyx/NyxLess.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NyxSiteKit: "chrome://browser/content/nyx/NyxSiteKit.sys.mjs",
  NyxTheme: "chrome://browser/content/nyx/NyxTheme.sys.mjs",
});

const ROOT = "chrome://browser/content/nyx/sitestyles";
const LIB_URI = `${ROOT}/lib/std-v1.less`;

// id → { name, hosts, file under styles/ }
export const BUILTIN = [
  { id: "youtube", name: "YouTube", hosts: ["youtube.com"], file: "youtube" },
  { id: "github", name: "GitHub", hosts: ["github.com", "gist.github.com"], file: "github" },
  { id: "google", name: "Google", hosts: ["google.com", "www.google.com"], file: "google" },
  { id: "gmail", name: "Gmail", hosts: ["mail.google.com"], file: "gmail" },
  { id: "reddit", name: "Reddit", hosts: ["reddit.com", "www.reddit.com"], file: "reddit" },
  { id: "x", name: "X", hosts: ["x.com", "twitter.com"], file: "twitter" },
  { id: "wikipedia", name: "Wikipedia", hosts: ["wikipedia.org"], file: "wikipedia" },
  { id: "duckduckgo", name: "DuckDuckGo", hosts: ["duckduckgo.com"], file: "duckduckgo" },
  { id: "stackoverflow", name: "Stack Overflow", hosts: ["stackoverflow.com"], file: "stack-overflow" },
  { id: "hackernews", name: "Hacker News", hosts: ["news.ycombinator.com"], file: "hacker-news" },
  { id: "gemini", name: "Gemini", hosts: ["gemini.google.com"], file: "google-gemini" },
  { id: "perplexity", name: "Perplexity", hosts: ["perplexity.ai"], file: "perplexity" },
  { id: "pinterest", name: "Pinterest", hosts: ["pinterest.com"], file: "pinterest" },
];

const CATPPUCCIN_IDS = {
  "catppuccin-latte": "latte",
  "catppuccin-frappe": "frappe",
  "catppuccin-frappé": "frappe",
  "catppuccin-macchiato": "macchiato",
  "catppuccin-mocha": "mocha",
  latte: "latte",
  frappe: "frappe",
  macchiato: "macchiato",
  mocha: "mocha",
};

let libSource = null;
let started = false;
const cache = new Map(); // `${themeKey}|${styleId}|${valuesKey}` → sections

async function read(uri) {
  return (await fetch(uri)).text();
}

async function lib() {
  libSource ??= await read(LIB_URI);
  return libSource;
}

/** --nyx-* tokens from a theme stylesheet. */
function tokensOf(css) {
  const out = {};
  for (const [, name, value] of css.matchAll(/(--nyx-[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    out[name] = value.trim().replace(/\s*!important$/, "");
  }
  return out;
}

function mix(a, b, amount) {
  // LESS will resolve color-mix when it can; for hex tokens, leave a color-mix expression.
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(a) && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(b)) {
    return `mix(${a}, ${b}, ${Math.round(amount * 100)}%)`;
  }
  return a;
}

/**
 * A Catppuccin-shaped palette from Nyx theme tokens (and optional bridge colours).
 * Accent lands on @blue so @accentColor: blue picks it up.
 */
function nyxPalette(tokens, colours = {}) {
  const bg = colours.bg || tokens["--nyx-bg"] || "#1e1e2e";
  const panel = colours.panel || tokens["--nyx-panel"] || bg;
  const card = colours.card || tokens["--nyx-card"] || panel;
  const text = colours.text || tokens["--nyx-text"] || "#cdd6f4";
  const dim = colours.dim || tokens["--nyx-dim"] || "#a6adc8";
  const accent = colours.accent || tokens["--nyx-accent"] || "#89b4fa";
  const danger = tokens["--nyx-danger"] || "#f38ba8";
  const warning = tokens["--nyx-warning"] || "#f9e2af";
  const success = tokens["--nyx-success"] || "#a6e3a1";
  const swatches = colours.swatches || [];
  const at = (i, fallback) => swatches[i] || fallback;
  return {
    rosewater: at(0, accent),
    flamingo: at(1, danger),
    pink: at(2, danger),
    mauve: at(3, accent),
    red: danger,
    maroon: danger,
    peach: warning,
    yellow: warning,
    green: success,
    teal: at(4, success),
    sky: accent,
    sapphire: accent,
    blue: accent,
    lavender: at(3, accent),
    text,
    subtext1: mix(text, dim, 0.35),
    subtext0: dim,
    overlay2: mix(dim, card, 0.3),
    overlay1: mix(dim, card, 0.45),
    overlay0: mix(dim, card, 0.6),
    surface2: mix(card, text, 0.14),
    surface1: mix(card, text, 0.08),
    surface0: card,
    base: bg,
    mantle: panel,
    crust: mix(bg, "#000000", 0.35),
  };
}

/** Put a @nyx flavour into Catppuccin's map, copying mocha's filters for SVG recolouring. */
function withNyxFlavor(libText, palette) {
  const colours = Object.entries(palette)
    .map(([name, value]) => `@${name}: ${value};`)
    .join(" ");
  const withPalette = libText.replace(/@catppuccin:\s*\{/, `@catppuccin: {\n  @nyx: { ${colours} };`);
  // Copy mocha's filter block as @nyx so #lib.palette() finds *-filter keys.
  return withPalette.replace(
    /(@catppuccin-filters:\s*\{[\s\S]*?)(@mocha:\s*\{[\s\S]*?\};)/,
    (_, head, mocha) => `${head}${mocha}\n  @nyx: ${mocha.replace(/^@mocha:\s*/, "")}`
  );
}

/**
 * Compiles one Catppuccin userstyle for the current theme.
 *
 * @param {string} source the .user.less file
 * @param {object} meta parseUserStyle(source)
 * @param {object} values @var overrides from Settings
 * @param {object} theme { css, id?, colours?, light? }
 */
export async function compileBuiltin(source, meta, values, theme) {
  const tokens = tokensOf(theme.css || "");
  const catppuccin = CATPPUCCIN_IDS[theme.id] || null;

  const vars = { ...(meta?.vars ? Object.fromEntries(Object.entries(meta.vars).map(([n, o]) => [n, o.default])) : {}), ...values };
  // Force both flavours to the same palette so light/dark pages on a themed Browser match.
  if (catppuccin) {
    vars.lightFlavor = catppuccin;
    vars.darkFlavor = catppuccin;
  } else {
    vars.lightFlavor = "nyx";
    vars.darkFlavor = "nyx";
  }
  if (!vars.accentColor) {
    vars.accentColor = "blue";
  }

  const header = Object.entries(vars)
    .map(([name, value]) => {
      const option = meta?.vars?.[name];
      const rendered = String(option ? varValue(option, value) : value);
      // Select and checkbox values are LESS identifiers; text and colours stay quoted.
      const asIdent = !option || option.type === "select" || option.type === "checkbox" || option.type === "dropdown";
      const literal = asIdent && /^[\w-]+$/.test(rendered) ? rendered : JSON.stringify(rendered);
      return `@${name}: ${literal};`;
    })
    .join("\n");

  let libText = await lib();
  if (!catppuccin) {
    libText = withNyxFlavor(libText, nyxPalette(tokens, theme.colours || {}));
  }

  const body = source
    .replace(/\/\*\s*==UserStyle==[\s\S]*?==\/UserStyle==\s*\*\//, "")
    .replace(/@import\s+"https:\/\/userstyles\.catppuccin\.com\/lib\/std\/v1\.less"\s*;/, "/* vendored lib */");

  const less = `${libText}\n${header}\n${body}`;
  const css = await NyxLess.render(less, { filename: `${meta?.name || "style"}.less` });
  return documentSections(css);
}

async function themeInfo(css) {
  let id = "";
  let light = false;
  let colours = {};
  try {
    const themes = await lazy.NyxTheme.themes();
    id = themes?.current?.theme === "follow" ? themes?.system?.id : themes?.current?.theme;
    const entry = themes?.themes?.find(t => t.id === id) || (themes?.current?.theme === "follow" ? themes?.system : null);
    if (entry) {
      light = !!entry.light;
      colours = entry.colours || {};
      if (themes?.current?.accent) {
        const swatch = themes.accents?.find(a => a.name === themes.current.accent);
        if (swatch?.colour) {
          colours = { ...colours, accent: swatch.colour };
        }
      }
    }
  } catch (error) {
    console.error("Browser: couldn't read the theme list for site styles", error);
  }
  return { css, id: id || "", light, colours };
}

async function compileAll(css) {
  const theme = await themeInfo(css);
  const themeKey = `${theme.id}|${theme.colours.accent || ""}|${(css || "").length}`;
  const compiled = [];
  for (const style of BUILTIN) {
    try {
      const source = await read(`${ROOT}/styles/${style.file}/catppuccin.user.less`);
      const meta = parseUserStyle(source);
      const values = lazy.NyxSiteKit.builtinValues(style.id);
      const valuesKey = JSON.stringify(values);
      const cacheKey = `${themeKey}|${style.id}|${valuesKey}`;
      let sections = cache.get(cacheKey);
      if (!sections) {
        sections = await compileBuiltin(source, meta, values, theme);
        cache.set(cacheKey, sections);
        if (cache.size > 80) {
          cache.clear();
          cache.set(cacheKey, sections);
        }
      }
      compiled.push({
        id: style.id,
        name: style.name,
        hosts: style.hosts,
        sections,
        vars: meta?.vars ?? {},
      });
    } catch (error) {
      console.error(`Browser: couldn't compile the ${style.name} site style`, error);
      compiled.push({ id: style.id, name: style.name, hosts: style.hosts, sections: [], vars: {}, error: String(error?.message ?? error) });
    }
  }
  lazy.NyxSiteKit.setBuiltin(compiled, () => compileAll(lazy.NyxTheme.css || css));
}

/** Starts compiling Browser's styles once the theme is known, and again after each change. */
export function init() {
  if (started) {
    return;
  }
  started = true;
  lazy.NyxTheme.subscribe(css => {
    compileAll(css).catch(error => console.error("Browser: site styles", error));
  });
}

export const NyxSiteStyles = { init, compileBuiltin, BUILTIN };
