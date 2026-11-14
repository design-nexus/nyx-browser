/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Browser's own VPN, as NordVPN's extension is one: Browser's traffic goes through a provider's
// proxy servers, and nothing else on the computer does. A connection is a provider's server
// (NordVPN's HTTPS proxies, Private Internet Access's SOCKS5 one) or any SOCKS5, HTTPS or HTTP
// proxy. Each workspace can have its own, or none, or follow the switch in the VPN panel.
//
// The proxy is chosen per request, by the tab it's for (a channel filter, as Firefox's own IP
// Protection does). Logins are kept in the profile's login store, encrypted like saved passwords.

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
XPCOMUtils.defineLazyServiceGetter(lazy, "ProxyService", "@mozilla.org/network/protocol-proxy-service;1", Ci.nsIProtocolProxyService);

const STORE = () => PathUtils.join(PathUtils.profileDir, "nyx-vpn.json");
const LOGIN_ORIGIN = "chrome://nyx-vpn";
const PREFS = {
  killSwitch: "nyx.vpn.kill-switch",
  remoteDns: "nyx.vpn.remote-dns",
  webrtc: "nyx.vpn.webrtc",
  bypass: "nyx.vpn.bypass",
  nordApi: "nyx.vpn.nordvpn-api",
};
const RESOLVES_HOST = Ci.nsIProxyInfo.TRANSPARENT_PROXY_RESOLVES_HOST;
// Addresses that never go through the VPN: this computer and the network it's on.
const LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.localhost$)/;

export const PROVIDERS = {
  nordvpn: { name: "NordVPN", type: "https", port: 89, locations: true },
  pia: { name: "Private Internet Access", type: "socks", host: "proxy-nl.privateinternetaccess.com", port: 1080, location: { code: "NL", name: "Netherlands", city: "Amsterdam" } },
  proxy: { name: "Proxy" },
};

let state = null;
const listeners = new Set();
const proxyInfos = new Map();

async function load() {
  if (!state) {
    try {
      state = await IOUtils.readJSON(STORE());
    } catch {
      state = {};
    }
    state.connections ??= [];
    state.workspaces ??= {};
    state.favorites ??= [];
    delete state.recent;
    await readLogins().catch(error => console.error("Browser: VPN logins", error));
  }
  return state;
}

// One write at a time: two at once would share the temporary file.
let writing = Promise.resolve();

async function save() {
  writing = writing.then(() => IOUtils.writeJSON(STORE(), state, { tmpPath: `${STORE()}.tmp` }));
  await writing;
  proxyInfos.clear();
  applyProtection();
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  }
}

// ---- logins, in the profile's login store, and in memory for the filter, which can't wait ----

const logins = new Map();

async function readLogins() {
  const found = await Services.logins.searchLoginsAsync({ origin: LOGIN_ORIGIN });
  logins.clear();
  for (const login of found) {
    logins.set(login.httpRealm, { username: login.username, password: login.password });
  }
}

const loginFor = id => logins.get(id) ?? null;

async function keepLogin(id, username, password) {
  for (const old of await Services.logins.searchLoginsAsync({ origin: LOGIN_ORIGIN, httpRealm: id })) {
    await Services.logins.removeLoginAsync(old);
  }
  logins.delete(id);
  if (username || password) {
    const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
    login.init(LOGIN_ORIGIN, null, id, username ?? "", password ?? "", "", "");
    await Services.logins.addLoginAsync(login);
    logins.set(id, { username: username ?? "", password: password ?? "" });
  }
}

// ---- the proxy, per request ----

function connectionFor(browserId) {
  if (!state) {
    return null;
  }
  let id = state.active ?? null;
  if (browserId) {
    const browser = BrowsingContext.getCurrentTopByBrowserId(browserId)?.embedderElement;
    const tab = browser?.documentGlobal?.gBrowser?.getTabForBrowser(browser);
    const workspace = tab?.getAttribute("zen-workspace-id");
    const chosen = workspace && state.workspaces[workspace];
    if (chosen === "none") {
      return null;
    }
    if (chosen) {
      id = chosen;
    }
  }
  return state.connections.find(c => c.id === id) ?? null;
}

function proxyInfoFor(connection) {
  if (!proxyInfos.has(connection.id)) {
    const login = loginFor(connection.id);
    const key = `nyx-vpn-${connection.id}-${Date.now()}`;
    let info;
    if (connection.type === "socks") {
      info = lazy.ProxyService.newProxyInfoWithAuth(
        "socks",
        connection.host,
        connection.port,
        login?.username ?? "",
        login?.password ?? "",
        "",
        key,
        Services.prefs.getBoolPref(PREFS.remoteDns, true) ? RESOLVES_HOST : 0,
        0,
        null
      );
    } else {
      const header = login ? `Basic ${btoa(`${login.username}:${login.password}`)}` : "";
      info = lazy.ProxyService.newProxyInfo(connection.type, connection.host, connection.port, header, key, RESOLVES_HOST, 0, null);
    }
    proxyInfos.set(connection.id, info);
  }
  return proxyInfos.get(connection.id);
}

function bypassed(host) {
  if (LOCAL.test(host)) {
    return true;
  }
  const list = Services.prefs.getStringPref(PREFS.bypass, "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.some(rule => (rule.startsWith("*.") ? host.endsWith(rule.slice(1)) || host === rule.slice(2) : host === rule || host.endsWith(`.${rule}`)));
}

/** The connection a request goes through, or null. */
function decide(channel) {
  // DNS over HTTPS keeps to the network: through the proxy it would need itself to start.
  if (channel instanceof Ci.nsIHttpChannelInternal && channel.isTRRServiceChannel) {
    return null;
  }
  let host = "";
  try {
    host = channel.URI.host.toLowerCase();
  } catch {}
  const { targetBrowsingContext, browsingContext, triggeringPrincipal } = channel.loadInfo ?? {};
  // Browser's own asking for NordVPN's server list goes direct: a proxy that's down or turns
  // the request away would leave no list to pick another from.
  if (triggeringPrincipal?.isSystemPrincipal && host === nordApiHost()) {
    return null;
  }
  return bypassed(host) ? null : connectionFor((targetBrowsingContext ?? browsingContext)?.top?.browserId);
}

const filter = {
  QueryInterface: ChromeUtils.generateQI(["nsIProtocolProxyChannelFilter"]),
  applyFilter(channel, defaultProxyInfo, callback) {
    try {
      const connection = decide(channel);
      callback.onProxyFilterResult(connection ? proxyInfoFor(connection) : defaultProxyInfo);
    } catch (error) {
      console.error("Browser: VPN filter", error);
      callback.onProxyFilterResult(defaultProxyInfo);
    }
  },
};

// Firefox sends an HTTPS proxy its login itself (newProxyInfo's header) but asks for a plain
// HTTP proxy's: the login goes on each request the filter sends through one, and only those
// (Firefox copies it onto the CONNECT for https sites).
const httpLogin = {
  observe(channel) {
    try {
      channel.QueryInterface(Ci.nsIHttpChannel);
      const connection = decide(channel);
      const login = connection?.type === "http" && loginFor(connection.id);
      if (login) {
        channel.setRequestHeader("Proxy-Authorization", `Basic ${btoa(`${login.username}:${login.password}`)}`, false);
      }
    } catch {}
  },
};

let filtering = false;
function applyProtection() {
  const any = !!state && (state.active || Object.values(state.workspaces).some(v => v && v !== "none"));
  if (any && !filtering) {
    lazy.ProxyService.registerChannelFilter(filter, 0);
    Services.obs.addObserver(httpLogin, "http-on-modify-request");
    filtering = true;
  } else if (!any && filtering) {
    lazy.ProxyService.unregisterChannelFilter(filter);
    Services.obs.removeObserver(httpLogin, "http-on-modify-request");
    filtering = false;
  }
  // While a VPN is on: no going around it when it drops, and calls don't show the real address.
  const set = (pref, on, value) => (on ? Services.prefs.setBoolPref(pref, value) : Services.prefs.clearUserPref(pref));
  set("network.proxy.failover_direct", any && Services.prefs.getBoolPref(PREFS.killSwitch, true), false);
  const webrtc = any && Services.prefs.getBoolPref(PREFS.webrtc, true);
  set("media.peerconnection.ice.proxy_only_if_behind_proxy", webrtc, true);
  set("media.peerconnection.ice.default_address_only", webrtc, true);
}
for (const pref of [PREFS.killSwitch, PREFS.webrtc, PREFS.remoteDns]) {
  Services.prefs.addObserver(pref, () => {
    proxyInfos.clear();
    applyProtection();
  });
}

// ---- NordVPN's servers ----

const nordApi = () => Services.prefs.getStringPref(PREFS.nordApi, "https://api.nordvpn.com/v1");
function nordApiHost() {
  try {
    return new URL(nordApi()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

async function nordJSON(path) {
  const response = await fetch(`${nordApi()}${path}`, { credentials: "omit" });
  if (!response.ok) {
    throw new Error("NordVPN's server list couldn't be reached.");
  }
  return response.json();
}

let nordCountries = null;

export const NyxVpn = {
  PROVIDERS,

  async init() {
    await load();
    applyProtection();
  },

  async state() {
    await load();
    return state;
  },

  onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** The connection a tab's requests go through now, or null. */
  async forBrowser(browser) {
    await load();
    return connectionFor(browser?.browsingContext?.browserId);
  },

  /** The VPN for this workspace: "default" follows the switch, "none" has none, or an id. */
  async setWorkspace(workspace, choice) {
    await load();
    if (choice === "default") {
      delete state.workspaces[workspace];
    } else {
      state.workspaces[workspace] = choice;
    }
    await save();
  },

  /** The panel's switch: on with a connection (the last used), or off. */
  async setActive(id) {
    await load();
    state.active = id ?? null;
    await save();
  },

  async add({ provider, name, type, host, port, username, password, location }) {
    await load();
    const known = PROVIDERS[provider];
    if (!known) {
      throw new Error("Unknown provider");
    }
    const id = Services.uuid.generateUUID().toString().slice(1, 9);
    const connection = {
      id,
      provider,
      name: name || known.name,
      type: type ?? known.type,
      host: host ?? known.host,
      port: Number(port ?? known.port),
      location: location ?? known.location ?? null,
    };
    if (!connection.host && provider === "nordvpn") {
      Object.assign(connection, await this.nordServer(null));
    }
    if (!connection.host || !connection.port || !["https", "http", "socks"].includes(connection.type)) {
      throw new Error("Name a server and its port.");
    }
    await keepLogin(id, username, password);
    state.connections.push(connection);
    state.active ??= id;
    await save();
    return connection;
  },

  async remove(id) {
    await load();
    state.connections = state.connections.filter(c => c.id !== id);
    if (state.active === id) {
      state.active = null;
    }
    for (const [workspace, chosen] of Object.entries(state.workspaces)) {
      if (chosen === id) {
        delete state.workspaces[workspace];
      }
    }
    await keepLogin(id, "", "");
    await save();
  },

  /**
   * NordVPN's countries and their cities, for the panel's locations, by name. A place is a
   * country `{ kind: "country", id, code, name }` or a city `{ kind: "city", id, code, name,
   * country }`, `code` and `country` being its country's.
   */
  async countries() {
    nordCountries ??= nordJSON("/servers/countries").then(
      list =>
        list
          .map(c => ({
            kind: "country",
            id: c.id,
            code: c.code,
            name: c.name,
            cities: (c.cities ?? [])
              .map(city => ({ kind: "city", id: city.id, code: c.code, name: city.name, country: c.name }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      error => {
        nordCountries = null;
        throw error;
      }
    );
    return nordCountries;
  },

  /** NordVPN's recommended HTTPS proxy in a place (a country or a city), or wherever is fastest. */
  async nordServer(place) {
    const filter = place?.kind === "city" ? `filters[country_city_id]=${place.id}` : place ? `filters[country_id]=${place.id}` : "";
    const query = ["filters[servers_technologies][identifier]=proxy_ssl", filter, "limit=1"].filter(Boolean).join("&");
    const [server] = await nordJSON(`/servers/recommendations?${query}`);
    if (!server?.hostname) {
      throw new Error("No NordVPN proxy here right now");
    }
    const found = server.locations?.[0]?.country;
    return {
      host: server.hostname,
      port: PROVIDERS.nordvpn.port,
      server: server.name ?? server.hostname,
      place: place ? { kind: place.kind, id: place.id } : null,
      fastest: !place,
      location: {
        code: found?.code ?? place?.code ?? "",
        name: found?.name ?? (place?.kind === "city" ? place.country : place?.name) ?? "",
        city: found?.city?.name ?? (place?.kind === "city" ? place.name : ""),
      },
    };
  },

  /** Moves a NordVPN connection to a place (null: the fastest server). */
  async moveTo(id, place) {
    await load();
    const connection = state.connections.find(c => c.id === id);
    if (!connection || connection.provider !== "nordvpn") {
      return;
    }
    Object.assign(connection, await this.nordServer(place));
    await save();
  },

  /** Stars a place, or takes its star away. Favourites are the panel's first locations. */
  async setFavorite(place, on) {
    await load();
    const same = f => f.kind === place.kind && f.id === place.id;
    state.favorites = state.favorites.filter(f => !same(f));
    if (on) {
      const { kind, id, code, name, country } = place;
      state.favorites.push(kind === "city" ? { kind, id, code, name, country } : { kind, id, code, name });
    }
    await save();
  },
};

setTimeout(() => NyxVpn.init().catch(console.error), 0);
