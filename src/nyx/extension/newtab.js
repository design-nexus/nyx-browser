/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The new tab page: search, your favorite sites, the sites you visit most, and tabs you closed
 * lately. Sections can be hidden and put in any order, favorites added, removed and dragged into
 * order, and there's a choice of background. Nothing is fetched from the network, and there's no
 * sponsored content or news. */
"use strict";

const WEB = /^https?:\/\//i;
const FREQUENT = 6;
const RECENT = 5;
const SECTIONS = {
  favorites: "Favorites",
  frequent: "Frequently visited",
  recent: "Recent tabs",
};
const DEFAULTS = {
  sections: ["favorites", "frequent", "recent"],
  hidden: [],
  favorites: [],
  background: "none",
  picture: "",
  showWeather: true,
};
let settings = { ...DEFAULTS };

const save = change => {
  Object.assign(settings, change);
  return browser.storage.local.set(change);
};

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function element(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name.startsWith("on")) {
      node.addEventListener(name.slice(2), value);
    } else if (value !== false && value !== undefined) {
      node.setAttribute(name, value === true ? "" : value);
    }
  }
  node.append(...children);
  return node;
}

function siteIcon(favicon, label) {
  const box = element("span", { class: "site-icon" });
  if (favicon) {
    box.append(element("img", { src: favicon, alt: "" }));
  } else {
    box.textContent = (label || "?")[0].toUpperCase();
  }
  return box;
}

function tile(url, title, favicon, extra = []) {
  const name = title || hostOf(url);
  return element("a", { class: "site", href: url, title: `${name}\n${url}` }, siteIcon(favicon, name), element("span", {}, name), ...extra);
}

function heading(key, action) {
  return element("h2", { class: "group" }, SECTIONS[key], action || "");
}

/* ---------- Favorites: yours, in your order ---------- */

function moveFavorite(from, to) {
  const list = [...settings.favorites];
  const [moved] = list.splice(from, 1);
  list.splice(to, 0, moved);
  save({ favorites: list }).then(render);
}

/** Favicons Firefox has for the sites visited most, by host. */
async function knownIcons() {
  try {
    const sites = await browser.topSites.get({ limit: 100, includeFavicon: true, onePerDomain: false });
    return new Map(sites.filter(site => site.favicon).map(site => [hostOf(site.url), site.favicon]));
  } catch {
    return new Map();
  }
}

async function favoritesSection() {
  const grid = element("div", { id: "favorites", class: "tiles" });
  const icons = await knownIcons();
  settings.favorites.forEach((site, index) => {
    const remove = element("button", {
      class: "remove",
      type: "button",
      title: `Remove ${site.title || hostOf(site.url)}`,
      "aria-label": `Remove ${site.title || hostOf(site.url)}`,
      onclick: event => {
        event.preventDefault();
        save({ favorites: settings.favorites.filter((_, i) => i !== index) }).then(render);
      },
    }, "×");
    const edit = element("button", {
      class: "edit",
      type: "button",
      title: `Edit ${site.title || hostOf(site.url)}`,
      "aria-label": `Edit ${site.title || hostOf(site.url)}`,
      onclick: event => {
        event.preventDefault();
        openFavoriteDialog(index);
      },
    }, "✎");
    const link = tile(site.url, site.title, icons.get(hostOf(site.url)), [edit, remove]);
    link.draggable = true;
    link.addEventListener("dragstart", event => event.dataTransfer.setData("application/x-nyx-favorite", String(index)));
    link.addEventListener("dragover", event => event.dataTransfer.types.includes("application/x-nyx-favorite") && event.preventDefault());
    link.addEventListener("drop", event => {
      event.preventDefault();
      moveFavorite(Number(event.dataTransfer.getData("application/x-nyx-favorite")), index);
    });
    grid.append(link);
  });
  const add = element("button", { class: "site add", type: "button", onclick: () => openFavoriteDialog() }, element("span", { class: "site-icon" }, "+"), element("span", {}, "Add"));
  grid.append(add);
  const section = element("section", { "aria-label": SECTIONS.favorites }, heading("favorites"), grid);
  return section;
}

/** The address as typed, made a web address, or null. */
function webAddress(text) {
  let url = text.trim();
  if (!url) {
    return null;
  }
  if (!WEB.test(url)) {
    url = `https://${url}`;
  }
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes(".") || parsed.hostname === "localhost" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** The title of the page at `url`, if it's in history. */
async function knownTitle(url) {
  try {
    const visits = await browser.history.search({ text: hostOf(url), maxResults: 20, startTime: 0 });
    const same = visits.find(v => v.url === url) || visits.find(v => hostOf(v.url) === hostOf(url));
    return same?.title || "";
  } catch {
    return "";
  }
}

/** Adds a favorite, or edits the one at `index`. */
function openFavoriteDialog(index = -1) {
  const dialog = document.getElementById("favorite-dialog");
  const form = document.getElementById("favorite-form");
  const { url: address, title: name } = form.elements;
  const editing = settings.favorites[index];
  const error = document.getElementById("favorite-error");
  document.getElementById("favorite-heading").textContent = editing ? "Edit favorite" : "Add a favorite";
  document.getElementById("favorite-submit").textContent = editing ? "Save" : "Add";
  address.value = editing?.url || "";
  name.value = editing?.title || "";
  name.placeholder = "";
  let suggested = "";

  const showError = shown => {
    error.hidden = !shown;
    address.setAttribute("aria-invalid", String(shown));
  };
  const preview = () => {
    const url = webAddress(address.value);
    const label = name.value.trim() || suggested || (url ? hostOf(url) : "");
    document.getElementById("favorite-preview-icon").textContent = (label || "?")[0].toUpperCase();
    document.getElementById("favorite-preview-name").textContent = label || "New favorite";
    document.getElementById("favorite-preview-host").textContent = url ? hostOf(url) : "Its address shows here";
  };
  const suggest = async () => {
    const url = webAddress(address.value);
    suggested = url ? await knownTitle(url) : "";
    name.placeholder = suggested;
    preview();
  };
  address.oninput = () => {
    showError(false);
    preview();
  };
  address.onchange = suggest;
  name.oninput = preview;
  document.getElementById("favorite-cancel").onclick = () => dialog.close();
  form.onsubmit = event => {
    event.preventDefault();
    const url = webAddress(address.value);
    if (!url) {
      showError(true);
      address.focus();
      return;
    }
    const favorite = { url, title: name.value.trim() || suggested };
    const favorites = [...settings.favorites];
    if (editing) {
      favorites[index] = favorite;
    } else {
      favorites.push(favorite);
    }
    dialog.close();
    save({ favorites }).then(render);
  };

  showError(false);
  preview();
  if (editing) {
    suggest();
  }
  dialog.showModal();
  address.focus();
}

/* ---------- Frequently visited and recent tabs ---------- */

async function frequentSection() {
  const grid = element("div", { class: "tiles" });
  const sites = await browser.topSites.get({ limit: FREQUENT * 2, includeFavicon: true, onePerDomain: true });
  const favorite = new Set(settings.favorites.map(f => f.url));
  for (const site of sites.filter(s => WEB.test(s.url) && !favorite.has(s.url)).slice(0, FREQUENT)) {
    grid.append(tile(site.url, site.title, site.favicon));
  }
  return grid.childElementCount ? element("section", { "aria-label": SECTIONS.frequent }, heading("frequent"), grid) : null;
}

function ago(ms) {
  const minutes = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

async function recentSection() {
  const list = element("div", { id: "recent", class: "rows" });
  let rows = [];
  try {
    const closed = await browser.sessions.getRecentlyClosed({ maxResults: RECENT * 2 });
    rows = closed
      .filter(entry => entry.tab && WEB.test(entry.tab.url))
      .map(entry => ({ url: entry.tab.url, title: entry.tab.title, favicon: entry.tab.favIconUrl, when: entry.lastModified, sessionId: entry.tab.sessionId }));
  } catch {
    // Without session history the last pages visited stand in.
  }
  if (!rows.length) {
    const visits = await browser.history.search({ text: "", maxResults: RECENT * 3, startTime: 0 });
    rows = visits.filter(v => WEB.test(v.url)).map(v => ({ url: v.url, title: v.title, when: v.lastVisitTime }));
  }
  const seen = new Set();
  rows = rows.filter(row => !seen.has(row.url) && seen.add(row.url));
  for (const row of rows.slice(0, RECENT)) {
    const link = element("a", { class: "row", href: row.url },
      siteIcon(row.favicon, row.title || hostOf(row.url)),
      element("span", { class: "row-text" }, row.title || hostOf(row.url)),
      element("span", { class: "when" }, row.when ? ago(row.when) : ""));
    if (row.sessionId) {
      // A closed tab comes back with its history, as Reopen closed tab (Ctrl+Z) brings it back.
      link.addEventListener("click", event => {
        if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
          event.preventDefault();
          browser.sessions.restore(row.sessionId).catch(() => (location.href = row.url));
        }
      });
    }
    list.append(link);
  }
  return list.childElementCount ? element("section", { "aria-label": SECTIONS.recent }, heading("recent"), list) : null;
}

/* ---------- The page ---------- */

const BUILDERS = { favorites: favoritesSection, frequent: frequentSection, recent: recentSection };

async function render() {
  const shown = settings.sections.filter(key => BUILDERS[key] && !settings.hidden.includes(key));
  const built = await Promise.all(shown.map(key => Promise.resolve(BUILDERS[key]()).catch(error => {
    console.error(`New tab: the ${key} section failed`, error);
    return null;
  })));
  document.getElementById("sections").replaceChildren(...built.filter(Boolean));
  renderOptions();
}

function renderOptions() {
  const list = document.getElementById("section-list");
  list.replaceChildren(...settings.sections.map((key, index) => {
    const on = !settings.hidden.includes(key);
    const move = (by, label) => element("button", {
      type: "button",
      class: "icon-button",
      title: label,
      "aria-label": `${label}: ${SECTIONS[key]}`,
      disabled: index + by < 0 || index + by >= settings.sections.length,
      onclick: () => {
        const order = [...settings.sections];
        [order[index], order[index + by]] = [order[index + by], order[index]];
        save({ sections: order }).then(render);
      },
    }, by < 0 ? "↑" : "↓");
    const box = element("input", {
      type: "checkbox",
      checked: on,
      onchange: event => save({ hidden: event.target.checked ? settings.hidden.filter(k => k !== key) : [...settings.hidden, key] }).then(render),
    });
    return element("li", {}, element("label", { class: "check" }, box, SECTIONS[key]), move(-1, "Move up"), move(1, "Move down"));
  }));
  for (const radio of document.querySelectorAll("input[name=background]")) {
    radio.checked = radio.value === settings.background;
  }
  document.getElementById("show-weather").checked = settings.showWeather;
}

function applyBackground() {
  const root = document.documentElement;
  root.dataset.background = settings.background;
  root.style.setProperty("--picture", settings.background === "image" && settings.picture ? `url("${settings.picture}")` : "none");
}

/**
 * "Calera · Clear sky 52°" from Weather's bar reading ("☾ 52°") and the first line of
 * its details ("Calera · Alabama, United States — Clear sky").
 */
function weatherLine(text, details) {
  const temperature = text.match(/-?\d+°\w?/)?.[0] ?? text;
  const [place, condition] = (details.split("\n")[0] || "").split(" — ");
  const town = place?.split(" · ")[0].trim();
  return [town, [condition?.trim(), temperature].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
}

/** What Weather last fetched. With no Weather app or no reading yet, it stays away. */
async function showWeather() {
  const card = document.getElementById("weather");
  card.hidden = true;
  if (!settings.showWeather) {
    return;
  }
  try {
    const { text, details } = await browser.runtime.sendMessage({ to: "background", action: "weather" });
    document.getElementById("weather-now").textContent = weatherLine(text, details || "");
    card.title = details || "";
    card.hidden = false;
  } catch {
    // Nothing to show.
  }
}

async function start() {
  settings = { ...DEFAULTS, ...(await browser.storage.local.get(DEFAULTS)) };
  settings.sections = [...settings.sections, ...DEFAULTS.sections.filter(k => !settings.sections.includes(k))];
  applyBackground();

  const customize = document.getElementById("customize");
  const options = document.getElementById("options");
  customize.addEventListener("click", () => {
    options.hidden = !options.hidden;
    customize.setAttribute("aria-expanded", String(!options.hidden));
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !options.hidden) {
      options.hidden = true;
      customize.setAttribute("aria-expanded", "false");
      customize.focus();
    }
  });

  const picture = document.getElementById("picture");
  for (const radio of document.querySelectorAll("input[name=background]")) {
    radio.addEventListener("change", () => {
      if (radio.value === "image") {
        picture.click();
        return;
      }
      save({ background: radio.value }).then(applyBackground);
    });
  }
  picture.addEventListener("change", () => {
    const file = picture.files[0];
    if (!file) {
      renderOptions();
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => save({ background: "image", picture: reader.result }).then(applyBackground));
    reader.readAsDataURL(file);
  });
  document.getElementById("show-weather").addEventListener("change", event => save({ showWeather: event.target.checked }).then(showWeather));

  document.getElementById("search").addEventListener("submit", async event => {
    event.preventDefault();
    const text = document.getElementById("query").value.trim();
    if (!text) {
      return;
    }
    if (WEB.test(text) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) {
      location.href = WEB.test(text) ? text : `https://${text}`;
    } else {
      await browser.search.query({ text, disposition: "CURRENT_TAB" });
    }
  });
  await Promise.allSettled([render(), showWeather()]);
}

/** The tab's icon: the page's own mark, in the theme's accent. */
function setTabIcon() {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--nyx-accent").trim() || "#3d8ae8";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">` +
    `<rect width="24" height="24" rx="6" fill="${accent}" fill-opacity="0.2"/>` +
    `<path d="M6 8h12v8H6zM6 11h12" fill="none" stroke="${accent}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  let link = document.querySelector("link[rel=icon]");
  if (!link) {
    link = element("link", { rel: "icon", type: "image/svg+xml" });
    document.head.append(link);
  }
  link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

document.addEventListener("nyx-theme", setTabIcon);
setTabIcon();
start();
