/* The new tab page: search, the sites you visit most, and what you visited last. Nothing is
 * fetched from the network, and there's no sponsored content or news. */
"use strict";

const FAVORITES = 7;
const RECENT = 5;
const WEB = /^https?:\/\//i;

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function siteIcon(favicon, label) {
  const box = document.createElement("span");
  box.className = "site-icon";
  if (favicon) {
    const image = document.createElement("img");
    image.src = favicon;
    image.alt = "";
    box.append(image);
  } else {
    box.textContent = (label || "?")[0].toUpperCase();
  }
  return box;
}

async function showFavorites(show) {
  const box = document.getElementById("favorites");
  box.replaceChildren();
  if (!show) {
    return;
  }
  const sites = await browser.topSites.get({ limit: FAVORITES, includeFavicon: true, onePerDomain: true, newtabpage: false });
  for (const site of sites.filter(s => WEB.test(s.url))) {
    const link = document.createElement("a");
    link.className = "site";
    link.href = site.url;
    link.title = site.title || site.url;
    const name = document.createElement("span");
    name.textContent = site.title || hostOf(site.url);
    link.append(siteIcon(site.favicon, name.textContent), name);
    box.append(link);
  }
}

async function showRecent(show) {
  document.getElementById("recent-box").hidden = !show;
  const box = document.getElementById("recent");
  box.replaceChildren();
  if (!show) {
    return;
  }
  const visits = await browser.history.search({ text: "", maxResults: RECENT * 3, startTime: 0 });
  const rows = visits.filter(v => WEB.test(v.url)).slice(0, RECENT);
  document.getElementById("recent-box").hidden = rows.length === 0;
  for (const visit of rows) {
    const link = document.createElement("a");
    link.className = "row";
    link.href = visit.url;
    const text = document.createElement("span");
    text.className = "row-text";
    text.textContent = visit.title || hostOf(visit.url);
    const sub = document.createElement("span");
    sub.className = "row-sub";
    sub.textContent = hostOf(visit.url);
    text.append(sub);
    link.append(siteIcon(null, text.textContent), text);
    box.append(link);
  }
}

async function start() {
  const stored = await browser.storage.local.get({ showFavorites: true, showRecent: true });
  const favorites = document.getElementById("show-favorites");
  const recent = document.getElementById("show-recent");
  favorites.checked = stored.showFavorites;
  recent.checked = stored.showRecent;
  favorites.addEventListener("change", () => {
    browser.storage.local.set({ showFavorites: favorites.checked });
    showFavorites(favorites.checked);
  });
  recent.addEventListener("change", () => {
    browser.storage.local.set({ showRecent: recent.checked });
    showRecent(recent.checked);
  });
  const customize = document.getElementById("customize");
  customize.addEventListener("click", () => {
    const options = document.getElementById("options");
    options.hidden = !options.hidden;
    customize.setAttribute("aria-expanded", String(!options.hidden));
  });
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
  await Promise.allSettled([showFavorites(stored.showFavorites), showRecent(stored.showRecent)]);
}

start();
