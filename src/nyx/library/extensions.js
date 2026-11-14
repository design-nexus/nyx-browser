/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// about:extensions (and about:addons). Each section is the page's address hash: #extensions,
// #themes, #plugins, #access, #shortcuts, #detail/<id>[/permissions|/options]. The add-on manager
// keeps everything; the page shows it and follows it.

const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
const { NyxTheme } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxTheme.sys.mjs");

const ICONS = "chrome://browser/content/nyx/icons";
const UBO = "uBlock0@raymondhill.net";
const PRIVATE = { permissions: ["internal:privateBrowsingAllowed"], origins: [] };
const content = document.getElementById("content");
const actions = document.getElementById("actions");
const find = document.getElementById("find");
const l10n = document.l10n;
const top = () => window.browsingContext.topChromeWindow;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};
const icon = (name, className = "") => {
  const img = el("img", className);
  img.src = `${ICONS}/${name}.svg`;
  img.alt = "";
  return img;
};
const localized = (tag, className, l10nId, args) => {
  const node = el(tag, className);
  l10n.setAttributes(node, l10nId, args);
  return node;
};
const label = l10nId => localized("div", "gl", l10nId);
const card = rows => {
  const node = el("div", "card");
  node.append(...rows);
  return node;
};
const button = (l10nId, iconName, run, className = "pbtn") => {
  const node = el("button", className);
  if (iconName) {
    node.append(icon(iconName));
  }
  node.append(localized("span", "", l10nId));
  node.addEventListener("click", run);
  return node;
};
const link = (l10nId, run) => {
  const node = localized("button", "lnk", l10nId);
  node.addEventListener("click", event => {
    event.stopPropagation();
    run();
  });
  return node;
};
/** A switch: `on` now, `change(on)` when it's flipped. */
function toggle(on, change, labelText = "") {
  const node = el("button", "sw");
  node.setAttribute("role", "switch");
  node.setAttribute("aria-checked", String(!!on));
  if (labelText) {
    node.setAttribute("aria-label", labelText);
  }
  node.addEventListener("click", async event => {
    event.stopPropagation();
    const next = node.getAttribute("aria-checked") !== "true";
    node.setAttribute("aria-checked", String(next));
    await change(next);
  });
  return node;
}
const addonIcon = addon => {
  const img = el("img", "fav xi");
  img.src = addon.iconURL || `${ICONS}/puzzle.svg`;
  img.alt = "";
  img.addEventListener("error", () => (img.src = `${ICONS}/puzzle.svg`), { once: true });
  return img;
};
const openSettings = pane => top()?.openPreferences(pane);
const yours = addon => !addon.hidden && !addon.isBuiltin && !addon.isSystem;
const widgetId = addon => `${addon.id.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}-browser-action`;

/** What an extension may read: every site, some, or none until you click it. */
function siteAccess(addon) {
  const policy = WebExtensionPolicy.getByID(addon.id);
  if (!addon.isActive || !policy) {
    return { l10nId: "nyx-ext-page-access-off", sites: [] };
  }
  const sites = policy.allowedOrigins.patterns.map(pattern => pattern.pattern).filter(pattern => !pattern.startsWith("moz-extension:"));
  if (sites.some(site => site === "<all_urls>" || /^\*:\/\/\*\//.test(site) || /^https?:\/\/\*\//.test(site))) {
    return { l10nId: "nyx-ext-page-access-all", sites };
  }
  if (!sites.length) {
    return { l10nId: "nyx-ext-page-access-click", sites };
  }
  const host = sites[0].replace(/^[^:]+:\/\/(\*\.)?/, "").replace(/\/.*$/, "");
  return { l10nId: "nyx-ext-page-access-sites", args: { host, more: sites.length - 1 }, sites };
}

// ---- Extensions: what's built into Browser, then yours, then plugins.

async function showExtensions(query) {
  actions.replaceChildren(button("nyx-ext-get-extensions", "plus", () => top()?.openTrustedLinkIn(Services.urlFormatter.formatURLPref("extensions.getAddons.link.url"), "tab"), "pbtn accent"));
  const all = await AddonManager.getAddonsByTypes(["extension"]);
  const parts = [];
  if (!query) {
    const ubo = all.find(addon => addon.id === UBO);
    const vpnOn = top()?.document.getElementById("nyx-vpn-button")?.hasAttribute("nyx-on");
    const big = (glyph, colour, titleId, noteId, pane, control) => {
      const node = el("div", "xcard card");
      const tile = el("span", "tile big");
      tile.style.setProperty("--c", colour);
      tile.append(icon(glyph));
      const text = el("div", "tt");
      text.append(localized("b", "", titleId), localized("span", "", noteId));
      const foot = el("div", "ft");
      foot.append(link("nyx-ext-page-settings", () => openSettings(pane)), el("span", "grow"), control ?? el("span"));
      node.append(tile, text, foot);
      return node;
    };
    const grid = el("div", "xgrid");
    grid.append(
      big("shield", "var(--sw-coral, #f07b58)", "nyx-ext-page-blocking", "nyx-ext-page-blocking-note", "paneNyxBlocking", ubo && toggle(ubo.isActive, on => (on ? ubo.enable() : ubo.disable()))),
      big("key", "var(--sw-violet, #8b5cf6)", "nyx-ext-page-passwords", "nyx-ext-page-passwords-note", "paneNyxPasswords", localized("span", "chip", "nyx-ext-built-in")),
      big("globe", "var(--sw-teal, #2bb3a8)", "nyx-ext-page-vpn", "nyx-ext-page-vpn-note", "paneNyxVpn", localized("span", "chip", vpnOn ? "nyx-ext-on" : "nyx-ext-off"))
    );
    parts.push(label("nyx-ext-page-built-in"), grid);
  }
  const mine = all.filter(yours).filter(addon => !query || `${addon.name} ${addon.description}`.toLowerCase().includes(query.toLowerCase()));
  mine.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  parts.push(label("nyx-ext-page-installed"));
  parts.push(mine.length ? card(mine.map(extensionRow)) : localized("div", "empty", query ? "nyx-library-nothing-found" : "nyx-ext-page-none"));
  if (!query) {
    const plugins = await AddonManager.getAddonsByTypes(["plugin"]);
    if (plugins.length) {
      parts.push(label("nyx-ext-page-plugins"), card(plugins.map(pluginRow)));
    }
  }
  content.replaceChildren(...parts);
}

function extensionRow(addon) {
  const row = el("div", "row link");
  row.toggleAttribute("nyx-off", !addon.isActive);
  const text = el("div", "rt");
  text.append(el("b", "", addon.name), el("span", "", addon.description ?? ""));
  const access = siteAccess(addon);
  const chip = localized("span", "chip", access.l10nId, access.args);
  row.append(addonIcon(addon), text, chip, toggle(addon.isActive, on => (on ? addon.enable() : addon.disable()), addon.name), moreButton(addon));
  row.addEventListener("click", () => (location.hash = `detail/${encodeURIComponent(addon.id)}`));
  return row;
}

// ---- An extension's menu (⋯), on its row and its page: what the toolbar's panel has.

let openMenu = null;
function closeMenu() {
  openMenu?.remove();
  openMenu = null;
}
document.addEventListener("click", closeMenu);
document.addEventListener("keydown", event => event.key === "Escape" && closeMenu());

function moreButton(addon) {
  const node = el("button", "ibtn more");
  node.append(icon("more"));
  l10n.setAttributes(node, "nyx-ext-page-more-for", { name: addon.name });
  node.addEventListener("click", event => {
    event.stopPropagation();
    const wasOpen = openMenu?.owner === node;
    closeMenu();
    if (!wasOpen) {
      showMenu(addon, node);
    }
  });
  return node;
}

function showMenu(addon, anchor) {
  const CUI = top()?.CustomizableUI;
  const id = widgetId(addon);
  const placement = addon.isActive && CUI?.getWidget(id)?.provider ? CUI.getPlacementOfWidget(id) : null;
  const menu = el("div", "menu");
  menu.owner = anchor;
  const item = (l10nId, iconName, run, { checked = null, danger = false } = {}) => {
    const node = el("button", danger ? "mi danger" : "mi");
    node.append(icon(iconName), localized("span", "", l10nId));
    if (checked !== null) {
      node.setAttribute("role", "menuitemcheckbox");
      node.setAttribute("aria-checked", String(checked));
      if (checked) {
        node.append(icon("check", "chk"));
      }
    }
    node.addEventListener("click", async event => {
      event.stopPropagation();
      closeMenu();
      await run();
    });
    menu.append(node);
  };
  const line = () => menu.append(el("div", "msep"));
  if (placement) {
    const pinned = placement.area !== CUI.AREA_ADDONS;
    item("nyx-ext-page-pin", "pin", async () => {
      await top().gUnifiedExtensions.pinToToolbar(id, !pinned);
      show();
    }, { checked: pinned });
    const count = CUI.getWidgetIdsInArea(placement.area).length;
    if (placement.position > 0) {
      item("nyx-ext-page-move-up", "back", () => (CUI.moveWidgetWithinArea(id, placement.position - 1), show()));
    }
    if (placement.position < count - 1) {
      item("nyx-ext-page-move-down", "forward", () => (CUI.moveWidgetWithinArea(id, placement.position + 2), show()));
    }
    line();
  }
  const page = `detail/${encodeURIComponent(addon.id)}`;
  if (addon.optionsURL && addon.isActive) {
    item("nyx-ext-page-own-settings", "settings", () => (location.hash = `${page}/options`));
  }
  item("nyx-ext-page-permissions-and-details", "settings", () => (location.hash = `${page}/permissions`));
  line();
  if (addon.permissions & AddonManager.PERM_CAN_UNINSTALL && yours(addon)) {
    item("nyx-ext-page-remove-menu", "close", () => top()?.NyxExtensions.remove(addon), { danger: true });
  }
  if (top()?.gAddonAbuseReportEnabled) {
    item("nyx-ext-page-report", "warning", () => top()?.BrowserAddonUI.reportAddon(addon.id, "unified_context_menu"));
  }
  document.body.append(menu);
  const box = anchor.getBoundingClientRect();
  menu.style.top = `${Math.min(box.bottom + 4, window.innerHeight - menu.offsetHeight - 8)}px`;
  menu.style.left = `${Math.max(8, box.right - menu.offsetWidth)}px`;
  openMenu = menu;
}

function pluginRow(plugin) {
  const row = el("div", "row");
  const tile = el("span", "tile blue");
  tile.append(icon("play"));
  const text = el("div", "rt");
  text.append(el("b", "", plugin.name), el("span", "", [plugin.description, plugin.version].filter(Boolean).join(" · ")));
  row.append(tile, text, toggle(!plugin.userDisabled, on => (on ? plugin.enable() : plugin.disable()), plugin.name));
  return row;
}

// ---- Themes: the Nyx themes and Browser's accent, for Browser alone. Firefox's add-on themes
// aren't shown: Browser's colours are the Nyx theme's.

/** A small window in a theme's colours, with its accent. */
function themePicture(colours, accent = colours.accent) {
  const node = el("div", "tw");
  for (const [name, value] of Object.entries({ b: colours.bg, p: colours.panel, c: colours.card, t: colours.text, d: colours.dim, a: accent })) {
    node.style.setProperty(`--${name}`, value);
  }
  const side = el("i", "s");
  side.append(el("u"), el("u"), el("u", "on"), el("u"));
  const sheet = el("i", "sh");
  sheet.append(el("b"), el("u"), el("u"), el("em"));
  node.append(side, sheet);
  return node;
}

async function showThemes(query) {
  actions.replaceChildren();
  let data;
  try {
    data = await NyxTheme.themes();
  } catch {
    content.replaceChildren(localized("p", "note", "nyx-ext-page-themes-unavailable"));
    return;
  }
  const { current, system, themes, accents } = data;
  const choose = async change => {
    await NyxTheme.choose(change);
    show();
  };
  const accentOf = name => accents.find(a => a.name === name)?.colour;
  const check = on => {
    const node = el("span", on ? "tchk" : "tchk off");
    if (on) {
      node.append(icon("check"));
    }
    return node;
  };

  const head = el("div", "st");
  head.append(localized("h2", "", "nyx-ext-page-themes"), localized("span", "", "nyx-ext-page-themes-sub"));

  const follow = el("button", "tfollow card");
  follow.toggleAttribute("selected", current.theme === "follow");
  const followText = el("div", "rt");
  followText.append(localized("b", "", "nyx-ext-page-follow"), localized("span", "", "nyx-ext-page-follow-note", { name: system.name, appearance: system.light ? "light" : "dark" }));
  follow.append(themePicture(system.colours, current.theme === "follow" ? accentOf(current.accent) : undefined), followText, check(current.theme === "follow"));
  follow.addEventListener("click", () => choose({ theme: "follow" }));

  const grid = list => {
    const node = el("div", "tgrid");
    for (const theme of list) {
      const on = theme.id === current.theme;
      const tile = el("button", "tcard");
      tile.toggleAttribute("selected", on);
      const name = el("div", "tn");
      name.append(el("b", "", theme.name));
      if (on) {
        name.append(icon("check"));
      }
      tile.append(themePicture(theme.colours, on ? accentOf(current.accent) : undefined), name);
      tile.addEventListener("click", () => choose({ theme: theme.id }));
      node.append(tile);
    }
    return node;
  };
  const shown = themes.filter(theme => !query || theme.name.toLowerCase().includes(query.toLowerCase()));
  const dark = shown.filter(theme => !theme.light);
  const light = shown.filter(theme => theme.light);

  const swatches = el("div", "accents");
  swatches.setAttribute("role", "radiogroup");
  const swatch = (name, colour) => {
    const node = el("button", name ? "acc" : "acc def");
    node.setAttribute("role", "radio");
    node.setAttribute("aria-checked", String(current.accent === name));
    const disc = el("i");
    disc.style.background = colour;
    node.append(disc);
    if (name) {
      l10n.setAttributes(node, `nyx-accent-${name}`);
    } else {
      node.append(localized("b", "", "nyx-ext-page-accent-default"));
    }
    node.addEventListener("click", () => choose({ accent: name }));
    return node;
  };
  swatches.append(swatch("", `conic-gradient(${accents.slice(0, 6).map(a => a.colour).join(", ")})`), ...accents.map(a => swatch(a.name, a.colour)));
  const accentHead = el("div", "gl glr");
  accentHead.append(localized("span", "", "nyx-ext-page-accent"), localized("span", "glnote", "nyx-ext-page-accent-note"));

  const parts = [head];
  if (!query) {
    parts.push(follow);
  }
  if (dark.length) {
    parts.push(label("nyx-ext-page-dark"), grid(dark));
  }
  if (light.length) {
    parts.push(label("nyx-ext-page-light"), grid(light));
  }
  if (!dark.length && !light.length) {
    parts.push(localized("div", "empty", "nyx-library-nothing-found"));
  }
  parts.push(accentHead, swatches);
  content.replaceChildren(...parts);
}

// ---- Plugins, Site access.

async function showPlugins(query) {
  actions.replaceChildren();
  const plugins = (await AddonManager.getAddonsByTypes(["plugin"])).filter(plugin => !query || plugin.name.toLowerCase().includes(query.toLowerCase()));
  content.replaceChildren(plugins.length ? card(plugins.map(pluginRow)) : localized("div", "empty", "nyx-library-nothing-found"));
}

async function showAccess(query) {
  actions.replaceChildren();
  const mine = (await AddonManager.getAddonsByTypes(["extension"])).filter(addon => yours(addon) && addon.isActive && (!query || addon.name.toLowerCase().includes(query.toLowerCase())));
  content.replaceChildren(
    localized("p", "note", "nyx-ext-page-access-note"),
    mine.length
      ? card(
          mine.map(addon => {
            const access = siteAccess(addon);
            const row = el("div", "row link");
            const text = el("div", "rt");
            text.append(el("b", "", addon.name), localized("span", "", access.l10nId, access.args));
            row.append(addonIcon(addon), text, icon("arrow-right", "dimi"));
            row.addEventListener("click", () => (location.hash = `detail/${encodeURIComponent(addon.id)}`));
            return row;
          })
        )
      : localized("div", "empty", "nyx-ext-page-none")
  );
}

// ---- One extension: its overview, its permissions and sites, and its own options page.

const TABS = ["overview", "permissions", "options"];

async function showDetail(id, tab) {
  actions.replaceChildren();
  const addon = await AddonManager.getAddonByID(id);
  if (!addon) {
    location.hash = "extensions";
    return;
  }
  const hasOptions = !!addon.optionsURL && addon.isActive;
  if (tab === "options" && !hasOptions) {
    tab = "overview";
  }
  const page = `detail/${encodeURIComponent(addon.id)}`;
  const back = el("div", "crumb");
  back.append(button("nyx-ext-page-extensions", "back", () => (location.hash = "extensions"), "lnk"));
  const head = el("div", "dh");
  const text = el("div", "tt");
  const date = addon.updateDate ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(addon.updateDate) : "";
  text.append(el("b", "", addon.name), localized("span", "", "nyx-ext-page-version", { version: addon.version, author: addon.creator?.name ?? "", date }));
  head.append(addonIcon(addon), text, toggle(addon.isActive, async on => {
    await (on ? addon.enable() : addon.disable());
    show();
  }, addon.name), moreButton(addon));
  const tabs = el("div", "tabs");
  tabs.setAttribute("role", "tablist");
  for (const name of TABS) {
    if (name === "options" && !hasOptions) {
      continue;
    }
    const node = localized("button", "", `nyx-ext-page-tab-${name}`);
    node.setAttribute("role", "tab");
    node.setAttribute("aria-selected", String(name === tab));
    node.addEventListener("click", () => (location.hash = name === "overview" ? page : `${page}/${name}`));
    tabs.append(node);
  }
  const parts = [back, head, tabs];
  if (tab === "permissions") {
    parts.push(await permissionsView(addon));
  } else if (tab === "options") {
    parts.push(optionsView(addon));
  } else {
    parts.push(...(await overviewView(addon)));
  }
  content.replaceChildren(...parts);
}

async function overviewView(addon) {
  const parts = [el("p", "desc", addon.description ?? "")];
  const access = siteAccess(addon);
  const summary = el("div", "row link");
  const summaryText = el("div", "rt");
  summaryText.append(localized("b", "", "nyx-ext-page-read-pages"), localized("span", "", access.l10nId, access.args));
  summary.append(summaryText, icon("arrow-right", "dimi"));
  summary.addEventListener("click", () => (location.hash = `detail/${encodeURIComponent(addon.id)}/permissions`));
  parts.push(label("nyx-ext-page-access"), card([summary]));

  const inBrowser = [];
  if (addon.incognito !== "not_allowed") {
    const perms = await ExtensionPermissions.get(addon.id);
    const row = el("div", "row");
    row.append(localized("b", "rt", "nyx-ext-page-private"), toggle(perms.permissions.includes("internal:privateBrowsingAllowed"), async on => {
      const extension = WebExtensionPolicy.getByID(addon.id)?.extension;
      await (on ? ExtensionPermissions.add(addon.id, PRIVATE, extension) : ExtensionPermissions.remove(addon.id, PRIVATE, extension));
      if (addon.isActive) {
        addon.reload();
      }
    }));
    inBrowser.push(row);
  }
  const CUI = top()?.CustomizableUI;
  if (CUI && addon.isActive && CUI.getWidget(widgetId(addon))?.provider) {
    const row = el("div", "row");
    const pinText = el("div", "rt");
    pinText.append(localized("b", "", "nyx-ext-page-pin"), localized("span", "", "nyx-ext-page-pin-note"));
    const placement = CUI.getPlacementOfWidget(widgetId(addon));
    row.append(pinText, toggle(placement?.area !== CUI.AREA_ADDONS, on => top().gUnifiedExtensions.pinToToolbar(widgetId(addon), on)));
    inBrowser.push(row);
  }
  const updates = el("div", "row");
  updates.append(localized("b", "rt", "nyx-ext-page-updates"), toggle(addon.applyBackgroundUpdates !== AddonManager.AUTOUPDATE_DISABLE, on => {
    addon.applyBackgroundUpdates = on ? AddonManager.AUTOUPDATE_DEFAULT : AddonManager.AUTOUPDATE_DISABLE;
  }));
  inBrowser.push(updates);
  parts.push(label("nyx-ext-page-in-browser"), card(inBrowser));

  const foot = el("div", "rm");
  const remove = button("nyx-ext-page-remove", "close", async () => {
    if (await top()?.NyxExtensions.remove(addon)) {
      location.hash = "extensions";
    }
  }, "pbtn danger");
  // Extensions built into Browser stay; they can be turned off.
  remove.hidden = !(addon.permissions & AddonManager.PERM_CAN_UNINSTALL) || !yours(addon);
  foot.append(remove);
  if (top()?.gAddonAbuseReportEnabled) {
    foot.append(button("nyx-ext-page-report-button", "warning", () => top()?.BrowserAddonUI.reportAddon(addon.id, "unified_context_menu")));
  }
  parts.push(foot);
  return parts;
}

/** What it needs, what it may ask for (switches), and the sites it may read. */
async function permissionsView(addon) {
  const { Extension } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
  const empty = { origins: [], permissions: [], data_collection: [] };
  const required = { ...(addon.userPermissions ?? empty) };
  const optional = { ...(addon.optionalPermissions ?? empty) };
  const granted = await ExtensionPermissions.get(addon.id);
  optional.origins = [...new Set([...(addon.optionalOriginsNormalized ?? []), ...granted.origins.filter(o => !required.origins.includes(o))])];
  const strings = Extension.formatPermissionStrings(
    { permissions: required, optionalPermissions: optional, fileSchemeAllowed: granted.permissions.includes("internal:fileSchemeAllowed") },
    { buildOptionalOrigins: true }
  );
  const policy = WebExtensionPolicy.getByID(addon.id);
  const change = async (kind, name, on) => {
    let perms = { permissions: [], origins: [], [kind]: [name] };
    perms = ExtensionPermissions.normalizeOptional(perms, addon.optionalPermissions);
    await ExtensionPermissions[on ? "add" : "remove"](addon.id, perms, policy?.extension);
    show();
  };

  const needs = strings.msgs.map(msg => {
    const row = el("div", "row");
    row.append(icon("check", "dimi"), el("b", "rt", msg));
    return row;
  });
  const optionalRows = [
    ...Object.entries(strings.optionalPermissions).map(([name, msg]) => ["permissions", name, msg]),
    ...Object.entries(strings.optionalOrigins).map(([name, msg]) => ["origins", name, msg]),
  ].map(([kind, name, msg]) => {
    const row = el("div", "row");
    const on = kind === "origins" && Extension.isAllSitesPermission(name) ? granted.origins.some(o => Extension.isAllSitesPermission(o)) : granted[kind].includes(name);
    row.append(el("b", "rt", msg), toggle(on, next => change(kind, name, next), msg));
    return row;
  });

  // The sites it may read now, each taken away on its own; another added if it may ask for it.
  const sites = (policy?.allowedOrigins.patterns ?? []).map(p => p.pattern).filter(p => !p.startsWith("moz-extension:"));
  const siteRows = sites.map(pattern => {
    const row = el("div", "row");
    const all = Extension.isAllSitesPermission(pattern);
    const name = all ? localized("b", "rt", "nyx-ext-page-every-site") : el("b", "rt", pattern.replace(/^[^:]+:\/\//, "").replace(/\/\*?$/, ""));
    row.append(name);
    if (granted.origins.includes(pattern) && !required.origins.includes(pattern)) {
      const remove = el("button", "ibtn");
      remove.append(icon("close"));
      l10n.setAttributes(remove, "nyx-ext-page-site-remove");
      remove.addEventListener("click", () => change("origins", pattern, false));
      row.append(remove);
    } else {
      row.append(localized("span", "chip", "nyx-ext-page-site-needed"));
    }
    return row;
  });
  const addSite = link("nyx-ext-page-site-add", async () => {
    const [title, prompt] = await l10n.formatValues([{ id: "nyx-ext-page-site-add-title" }, { id: "nyx-ext-page-site-add-prompt", args: { name: addon.name } }]);
    const box = { value: "" };
    if (!Services.prompt.prompt(window, title, prompt, box, null, {}) || !box.value.trim()) {
      return;
    }
    const host = box.value.trim().replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
    const { OriginControls } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
    await OriginControls.setAlwaysOn(policy, Services.io.newURI(`https://${host}/`));
    show();
  });
  addSite.hidden = !policy || !optional.origins.length;

  const left = el("div");
  left.append(label("nyx-ext-page-needs"), needs.length ? card(needs) : localized("div", "empty", "nyx-ext-page-needs-nothing"));
  if (optionalRows.length) {
    const head = el("div", "gl glr");
    head.append(localized("span", "", "nyx-ext-page-may-ask"), localized("span", "glnote", "nyx-ext-page-may-ask-note"));
    left.append(head, card(optionalRows));
  }
  const right = el("div");
  const sitesHead = el("div", "gl glr");
  sitesHead.append(localized("span", "", "nyx-ext-page-sites"), addSite);
  right.append(sitesHead, siteRows.length ? card(siteRows) : localized("div", "empty", "nyx-ext-page-access-click"));
  const cols = el("div", "cols");
  cols.append(left, right);
  return cols;
}

/** The extension's own options page, inside its page as Firefox's add-ons manager shows it. */
function optionsView(addon) {
  const box = el("div", "card xopts");
  if (addon.optionsType === AddonManager.OPTIONS_TYPE_TAB) {
    const row = el("div", "row");
    row.append(localized("b", "rt", "nyx-ext-page-options-tab"), button("nyx-ext-page-options-open", "openin", () => top()?.openTrustedLinkIn(addon.optionsURL, "tab")));
    box.append(row);
    return box;
  }
  inlineOptions(addon, box).catch(error => {
    console.error(error);
    box.replaceChildren(localized("div", "empty", "nyx-ext-page-options-failed"));
  });
  return box;
}

async function inlineOptions(addon, box) {
  const { E10SUtils } = ChromeUtils.importESModule("resource://gre/modules/E10SUtils.sys.mjs");
  const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
  const once = (target, name, capture = false) => new Promise(resolve => target.addEventListener(name, resolve, { once: true, capture }));
  const browser = document.createXULElement("browser");
  for (const [name, value] of Object.entries({ type: "content", disableglobalhistory: "true", messagemanagergroup: "webext-browsers", transparent: "true", forcemessagemanager: "true" })) {
    browser.setAttribute(name, value);
  }
  Object.defineProperty(browser, "autoCompletePopup", { configurable: true, get: () => top()?.document.getElementById("PopupAutoComplete") });
  const policy = WebExtensionPolicy.getByID(addon.id);
  browser.setAttribute("initialBrowsingContextGroupId", policy.browsingContextGroupId);
  const remoteType = ChromeUtils.predictRemoteTypeForURI(addon.optionsURL, { window, preferredRemoteType: E10SUtils.EXTENSION_REMOTE_TYPE });
  let ready;
  if (remoteType !== E10SUtils.NOT_REMOTE) {
    browser.setAttribute("remote", "true");
    browser.setAttribute("remoteType", remoteType);
    ready = once(browser, "XULFrameLoaderCreated");
  } else {
    ready = once(browser, "load", true);
  }
  box.replaceChildren(browser);
  browser.clientTop;
  await ready;
  if (!browser.messageManager) {
    return;
  }
  ExtensionParent.apiManager.emit("extension-browser-inserted", browser);
  const mm = browser.messageManager;
  mm.loadFrameScript("chrome://extensions/content/ext-browser-content.js", false, true);
  mm.addMessageListener("Extension:BrowserResized", { receiveMessage: ({ data }) => (browser.style.height = `${data.height}px`) });
  mm.sendAsyncMessage("Extension:InitBrowser", { fixedWidth: true, isInline: true, stylesheets: addon.optionsBrowserStyle ? ["chrome://browser/content/extension.css"] : undefined });
  browser.fixupAndLoadURIString(addon.optionsURL, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
}

// ---- Shortcuts: the keys for what each extension can do.

const BUILT_IN_COMMANDS = { _execute_action: "nyx-ext-page-cmd-action", _execute_browser_action: "nyx-ext-page-cmd-action", _execute_page_action: "nyx-ext-page-cmd-page-action", _execute_sidebar_action: "nyx-ext-page-cmd-sidebar" };
const KEYS = new Set([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", ...Array.from({ length: 19 }, (_, i) => `F${i + 1}`), "Home", "End", "PageUp", "PageDown", "Insert", "Delete", "Up", "Down", "Left", "Right", "Comma", "Period", "Space", "MediaNextTrack", "MediaPlayPause", "MediaPrevTrack", "MediaStop"]);

/** A key press as a shortcut string, like Alt+Shift+D, as Firefox's add-ons manager reads it. */
function shortcutOf(event) {
  const named = { ",": "Comma", ".": "Period", " ": "Space" };
  const key = [String.fromCharCode(event.which), event.code.toUpperCase(), event.code.replace(/^(Digit|Numpad|Arrow)/, ""), event.key.replace(/^(Digit|Numpad|Arrow)/, ""), named[event.key] ?? event.key].find(k => KEYS.has(k)) ?? "";
  return [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", key].filter(Boolean).join("+");
}

function keysOf(shortcut) {
  const node = el("span", "kbd");
  for (const part of (shortcut || "").split("+").filter(Boolean)) {
    node.append(el("kbd", "", part));
  }
  return node;
}

async function showShortcuts(query) {
  actions.replaceChildren();
  const { ExtensionShortcutKeyMap } = ChromeUtils.importESModule("resource://gre/modules/ExtensionShortcuts.sys.mjs");
  const { ShortcutUtils } = ChromeUtils.importESModule("resource://gre/modules/ShortcutUtils.sys.mjs");
  const addons = (await AddonManager.getAddonsByTypes(["extension"])).filter(a => a.isActive && !a.hidden && (!query || a.name.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name));
  const map = new ExtensionShortcutKeyMap();
  await map.buildForAddonIds(addons.map(a => a.id));

  const head = el("div", "st");
  head.append(localized("h2", "", "nyx-ext-page-shortcuts"), localized("span", "", "nyx-ext-page-shortcuts-sub"));
  const parts = [head];
  for (const addon of addons) {
    const shortcuts = WebExtensionPolicy.getByID(addon.id)?.extension?.shortcuts;
    if (!shortcuts) {
      continue;
    }
    const commands = await shortcuts.allCommands();
    if (!commands.length) {
      continue;
    }
    const title = el("div", "gl glr");
    const name = el("span");
    name.append(addonIcon(addon), el("span", "", addon.name));
    title.append(name);
    const rows = commands.map(command => {
      const row = el("div", "row krow");
      const text = el("div", "rt");
      const desc = BUILT_IN_COMMANDS[command.name] && !command.description ? localized("b", "", BUILT_IN_COMMANDS[command.name]) : el("b", "", command.description || command.name);
      const note = el("span", "warnt");
      text.append(desc, note);
      const others = command.shortcut ? [...(map.get(command.shortcut) ?? [])].filter(other => other !== addon.name) : [];
      if (others.length) {
        row.classList.add("clash");
        l10n.setAttributes(note, "nyx-ext-page-shortcut-clash", { shortcut: command.shortcut, other: others[0] });
      }
      const keys = command.shortcut ? keysOf(command.shortcut) : localized("span", "dimt", "nyx-ext-page-shortcut-none");
      keys.classList.add("kkeys");
      keys.tabIndex = 0;
      keys.setAttribute("role", "button");
      const start = () => record(row, keys, note, addon, command, shortcuts, map, ShortcutUtils);
      keys.addEventListener("click", start);
      keys.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          start();
        }
      });
      const edit = link(command.shortcut ? "nyx-ext-page-shortcut-change" : "nyx-ext-page-shortcut-set", start);
      row.append(text, keys, edit);
      if (command.shortcut) {
        const clear = el("button", "ibtn");
        clear.append(icon("close"));
        l10n.setAttributes(clear, "nyx-ext-page-shortcut-clear");
        clear.addEventListener("click", async () => {
          await shortcuts.updateCommand({ name: command.name, shortcut: "" });
          show();
        });
        row.append(clear);
      }
      return row;
    });
    parts.push(title, card(rows));
  }
  if (parts.length === 1) {
    parts.push(localized("div", "empty", "nyx-ext-page-shortcuts-none"));
  }
  content.replaceChildren(...parts);
}

/** Waits for the new keys on a row: Esc keeps the old ones, Backspace clears them. */
function record(row, keys, note, addon, command, shortcuts, map, ShortcutUtils) {
  if (row.classList.contains("rec")) {
    return;
  }
  row.classList.add("rec");
  const field = el("span", "krec");
  field.tabIndex = 0;
  l10n.setAttributes(field, "nyx-ext-page-shortcut-press");
  keys.replaceWith(field);
  field.focus();
  let ended = false;
  const done = () => {
    if (ended) {
      return;
    }
    ended = true;
    show();
  };
  // Delay blur-end so a click on Set/Change's mousedown doesn't cancel recording before keydown.
  field.addEventListener("blur", () => setTimeout(done, 150), { once: true });
  field.addEventListener("keydown", async event => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      field.blur();
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      await shortcuts.updateCommand({ name: command.name, shortcut: "" });
      field.blur();
      return;
    }
    const shortcut = shortcutOf(event);
    field.removeAttribute("data-l10n-id");
    field.replaceChildren(keysOf(shortcut));
    if (/^(Ctrl|Alt|Shift)?(\+(Ctrl|Alt|Shift))*\+?$/.test(shortcut)) {
      return;
    }
    const valid = ShortcutUtils.validate(shortcut);
    const say = (id, args) => l10n.setAttributes(note, id, args);
    if (valid === ShortcutUtils.MODIFIER_REQUIRED) {
      say("nyx-ext-page-shortcut-modifier");
    } else if (valid !== ShortcutUtils.IS_VALID) {
      say("nyx-ext-page-shortcut-invalid");
    } else if (ShortcutUtils.isSystem(top(), shortcut)) {
      say("nyx-ext-page-shortcut-browser", { shortcut });
    } else if (map.has(shortcut) && shortcut !== command.shortcut) {
      say("nyx-ext-page-shortcut-taken", { shortcut, other: map.getFirstAddonName(shortcut) });
    } else {
      await shortcuts.updateCommand({ name: command.name, shortcut });
      field.blur();
    }
  });
}

// ---- The page.

const SHOW = { extensions: showExtensions, themes: showThemes, plugins: showPlugins, access: showAccess, shortcuts: showShortcuts };
let shown = null;

/** The section in the address: a list, or an extension's page and its tab. Firefox's own
 * addresses for an extension's options (`…/preferences`) open its Its options tab. */
function section() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash.startsWith("detail/")) {
    const rest = hash.slice("detail/".length);
    const [, id, tab] = rest.match(/^(.*?)(?:\/(permissions|options|preferences))?$/);
    return ["detail", id, tab === "preferences" ? "options" : tab ?? "overview"];
  }
  return [SHOW[hash] ? hash : "extensions"];
}

async function show() {
  const [now, id, tab] = section();
  if (now !== shown) {
    shown = now;
    find.value = "";
  }
  closeMenu();
  for (const item of document.querySelectorAll(".nav-item")) {
    item.toggleAttribute("selected", item.dataset.section === (now === "detail" ? "extensions" : now));
  }
  document.querySelector(".top").hidden = now === "detail" || now === "themes" || now === "shortcuts";
  if (now === "detail") {
    await showDetail(id, tab);
  } else {
    await SHOW[now](find.value.trim());
  }
}

async function counts() {
  const set = (name, value) => (document.querySelector(`.nav-item[data-section="${name}"] .count`).textContent = value ? String(value) : "");
  const mine = (await AddonManager.getAddonsByTypes(["extension"])).filter(yours);
  set("extensions", mine.length);
  set("access", mine.filter(addon => addon.isActive).length);
  let commands = 0;
  for (const addon of mine.filter(a => a.isActive)) {
    commands += (await WebExtensionPolicy.getByID(addon.id)?.extension?.shortcuts?.allCommands())?.length ?? 0;
  }
  set("shortcuts", commands);
  set("themes", (await NyxTheme.themes().catch(() => ({ themes: [] }))).themes.length);
  set("plugins", (await AddonManager.getAddonsByTypes(["plugin"])).length);
}

for (const item of document.querySelectorAll(".nav-item")) {
  item.addEventListener("click", () => (location.hash = item.dataset.section));
}
window.addEventListener("hashchange", show);
let pending = 0;
find.addEventListener("input", () => {
  clearTimeout(pending);
  pending = setTimeout(show, 150);
});
const listener = { onEnabled: () => (show(), counts()), onDisabled: () => (show(), counts()), onInstalled: () => (show(), counts()), onUninstalled: () => (show(), counts()) };
AddonManager.addAddonListener(listener);
window.addEventListener("unload", () => AddonManager.removeAddonListener(listener), { once: true });

await show();
counts();
