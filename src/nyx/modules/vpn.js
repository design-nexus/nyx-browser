/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Browser's VPN in a window (NyxVpn): the VPN button, with a dot while this tab goes through one,
 * and its panel: on or off, which connection and where (NordVPN's favourite places, and its
 * countries and cities to search), and whether it's for every workspace or only this one. */
{
  const { NyxVpn } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxVpn.sys.mjs");
  const HTML = "http://www.w3.org/1999/xhtml";
  const BUTTON = "nyx-vpn-button";

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
  const l10n = (node, id, args) => {
    document.l10n.setAttributes(node, id, args);
    return node;
  };
  const flag = code => {
    const node = html("span", "nyx-vpn-flag", code ? String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1f1a5 + c.charCodeAt(0))) : "");
    node.title = code ?? "";
    return node;
  };
  const place = c => [c?.location?.name, c?.location?.city].filter(Boolean).join(" · ");

  async function showButton() {
    const node = document.getElementById(BUTTON);
    if (node) {
      const connection = await NyxVpn.forBrowser(gBrowser.selectedBrowser);
      node.toggleAttribute("nyx-on", !!connection);
      document.l10n.setAttributes(node, connection ? "nyx-vpn-button-on" : "nyx-vpn-button", { name: connection?.name ?? "", place: place(connection) });
    }
  }

  // ---- NordVPN's places, as Control Center has them: favourites first (the fastest server, then
  // starred countries and cities), a search over countries and cities, and every country, each
  // opening onto its cities. What's typed and what's open stay while the panel does.

  let query = "";
  const opened = new Set();
  const MAX_CITIES = 40;
  const sameAs = (a, b) => !!a && !!b && a.kind === b.kind && a.id === b.id;

  function locations(view, body, state, chosen) {
    const isFavorite = place => state.favorites.some(f => sameAs(f, place));
    // Where the connection is: the place it was moved to, or for one from before places were
    // kept, the city (or else the country) its server is in.
    const here = place => {
      if (chosen.place) {
        return sameAs(chosen.place, place);
      }
      if (chosen.fastest || chosen.location?.code !== place.code) {
        return false;
      }
      return place.kind === "city" ? chosen.location?.city === place.name : !chosen.location?.city;
    };

    /** Connects there; a place with no proxy now says so in its own row. */
    const move = async (place, row) => {
      body.setAttribute("nyx-busy", "true");
      try {
        await NyxVpn.moveTo(chosen.id, place);
      } catch (error) {
        body.removeAttribute("nyx-busy");
        row.querySelector(".nyx-vpn-note")?.remove();
        row.querySelector(".nyx-vpn-grow").append(html("small", "nyx-vpn-note", error.message));
        return;
      }
      body.removeAttribute("nyx-busy");
      query = "";
      show(view);
    };

    const star = place => {
      const on = isFavorite(place);
      const node = html("span", "nyx-vpn-star");
      node.setAttribute("role", "button");
      node.toggleAttribute("nyx-on", on);
      l10n(node, on ? "nyx-vpn-unstar" : "nyx-vpn-star", { name: place.name });
      node.addEventListener("click", async event => {
        event.stopPropagation();
        await NyxVpn.setFavorite(place, !on);
        show(view);
      });
      return node;
    };

    /** A place's row: its flag (not for a country's own cities), name, what it is, and star. */
    const placeRow = (place, { indent = false, sub = null, expand = null } = {}) => {
      const row = html("button", "nyx-vpn-row nyx-vpn-place");
      row.toggleAttribute("nyx-indent", indent);
      row.toggleAttribute("nyx-on", here(place));
      if (!indent) {
        row.append(flag(place.code));
      }
      const text = html("span", "nyx-vpn-grow");
      text.append(html("span", null, place.name));
      if (sub) {
        text.append(typeof sub === "string" ? html("small", null, sub) : sub);
      }
      row.append(text);
      if (here(place)) {
        row.append(html("span", "nyx-vpn-check"));
      }
      if (expand) {
        row.append(expand);
      }
      row.append(star(place));
      row.addEventListener("click", () => move(place, row));
      return row;
    };

    // Favourites
    body.append(l10n(html("div", "nyx-vpn-group"), "nyx-vpn-favorites"));
    const favorites = html("div", "nyx-vpn-list");
    const fastest = html("button", "nyx-vpn-row nyx-vpn-place");
    fastest.toggleAttribute("nyx-on", !!chosen.fastest);
    const fastestText = html("span", "nyx-vpn-grow");
    fastestText.append(l10n(html("span"), "nyx-vpn-fastest"), l10n(html("small"), "nyx-vpn-fastest-note"));
    fastest.append(html("span", "nyx-vpn-bolt"), fastestText);
    fastest.addEventListener("click", () => move(null, fastest));
    favorites.append(fastest);
    for (const place of state.favorites) {
      favorites.append(placeRow(place, { sub: place.kind === "city" ? place.country : l10n(html("small"), "nyx-vpn-whole-country") }));
    }
    body.append(favorites);

    // Search, and every country
    const field = html("label", "nyx-vpn-search");
    const input = html("input");
    input.type = "search";
    l10n(input, "nyx-vpn-find");
    input.value = query;
    field.append(input);
    body.append(field);
    const list = html("div", "nyx-vpn-list nyx-vpn-places");
    list.append(l10n(html("p", "nyx-vpn-note"), "nyx-vpn-loading"));
    body.append(list);

    NyxVpn.countries().then(
      countries => {
        const fill = () => {
          list.replaceChildren();
          const words = query.trim().toLowerCase();
          if (!words) {
            for (const country of countries) {
              const open = opened.has(country.id);
              const expand = html("span", "nyx-vpn-expand");
              expand.setAttribute("role", "button");
              expand.toggleAttribute("nyx-on", open);
              l10n(expand, "nyx-vpn-cities-in", { name: country.name });
              expand.addEventListener("click", event => {
                event.stopPropagation();
                open ? opened.delete(country.id) : opened.add(country.id);
                fill();
              });
              list.append(placeRow(country, { expand: country.cities.length ? expand : null }));
              if (open) {
                for (const city of country.cities) {
                  list.append(placeRow(city, { indent: true }));
                }
              }
            }
            return;
          }
          // Names starting with what's typed come first, then the rest, each by name.
          const rank = list =>
            list.sort((a, b) => {
              const sa = a.name.toLowerCase().startsWith(words), sb = b.name.toLowerCase().startsWith(words);
              return sa === sb ? a.name.localeCompare(b.name) : sa ? -1 : 1;
            });
          const found = rank(countries.filter(c => c.name.toLowerCase().includes(words) || c.code.toLowerCase() === words));
          const cities = rank(countries.flatMap(c => c.cities).filter(c => c.name.toLowerCase().includes(words))).slice(0, MAX_CITIES);
          if (found.length) {
            list.append(l10n(html("div", "nyx-vpn-group"), "nyx-vpn-countries-group"));
            for (const country of found) {
              list.append(placeRow(country));
            }
          }
          if (cities.length) {
            list.append(l10n(html("div", "nyx-vpn-group"), "nyx-vpn-cities-group"));
            for (const city of cities) {
              list.append(placeRow(city, { sub: city.country }));
            }
          }
          if (!found.length && !cities.length) {
            list.append(l10n(html("p", "nyx-vpn-note"), "nyx-vpn-no-match", { query: query.trim() }));
          }
        };
        input.addEventListener("input", () => {
          query = input.value;
          fill();
          list.scrollTop = 0;
        });
        fill();
        list.querySelector(".nyx-vpn-place[nyx-on]")?.scrollIntoView({ block: "nearest" });
      },
      error => list.replaceChildren(html("p", "nyx-vpn-error", error.message))
    );
  }

  async function show(view) {
    const body = view.querySelector(".panel-subview-body");
    const state = await NyxVpn.state();
    const workspace = gZenWorkspaces.activeWorkspace;
    const workspaceName = gZenWorkspaces.getWorkspaces().find(w => w.uuid === workspace)?.name ?? "";
    const mine = state.workspaces[workspace];
    const current = await NyxVpn.forBrowser(gBrowser.selectedBrowser);
    const chosen = current ?? state.connections.find(c => c.id === (mine && mine !== "none" ? mine : state.active)) ?? state.connections[0];
    body.replaceChildren();

    if (!state.connections.length) {
      const empty = html("div", "nyx-vpn-empty");
      empty.append(l10n(html("p"), "nyx-vpn-none"));
      const add = l10n(html("button", "nyx-vpn-action nyx-vpn-primary"), "nyx-vpn-add");
      add.addEventListener("click", () => {
        CustomizableUI.hidePanelForNode(view);
        openPreferences("paneNyxVpn");
      });
      empty.append(add);
      body.append(empty);
      return;
    }

    // On or off, and through what.
    const head = html("div", "nyx-vpn-head");
    const badge = html("span", "nyx-vpn-badge");
    badge.toggleAttribute("nyx-on", !!current);
    const text = html("div", "nyx-vpn-text");
    text.append(l10n(html("b"), current ? "nyx-vpn-connected" : "nyx-vpn-off"), html("small", null, [chosen.name, place(chosen)].filter(Boolean).join(" · ")));
    const toggle = html("button", "nyx-vpn-switch");
    toggle.setAttribute("role", "switch");
    toggle.toggleAttribute("nyx-on", !!current);
    toggle.addEventListener("click", async () => {
      if (current) {
        // Off here: this workspace's own choice goes, and the switch for every workspace.
        if (mine && mine !== "none") {
          await NyxVpn.setWorkspace(workspace, "default");
        }
        await NyxVpn.setActive(null);
      } else if (mine === "none") {
        await NyxVpn.setWorkspace(workspace, chosen.id);
      } else {
        await NyxVpn.setActive(chosen.id);
      }
      show(view);
    });
    head.append(badge, text, toggle);
    body.append(head);

    const stats = html("div", "nyx-vpn-stats");
    const stat = (id, value) => {
      const s = html("div");
      s.append(l10n(html("small"), id), html("span", null, value));
      return s;
    };
    stats.append(stat("nyx-vpn-server", chosen.host), stat("nyx-vpn-covers", ""));
    l10n(stats.lastChild.lastChild, "nyx-vpn-browser-only");
    body.append(stats);

    // Another connection, when there are several.
    if (state.connections.length > 1) {
      body.append(l10n(html("div", "nyx-vpn-label"), "nyx-vpn-connection"));
      const list = html("div", "nyx-vpn-list");
      for (const c of state.connections) {
        const row = html("button", "nyx-vpn-row");
        row.toggleAttribute("nyx-on", c.id === chosen.id);
        row.append(flag(c.location?.code), html("span", "nyx-vpn-grow", c.name), html("small", null, place(c)));
        row.addEventListener("click", async () => {
          if (mine && mine !== "none") {
            await NyxVpn.setWorkspace(workspace, c.id);
          } else {
            await NyxVpn.setActive(c.id);
          }
          show(view);
        });
        list.append(row);
      }
      body.append(list);
    }

    if (chosen.provider === "nordvpn") {
      body.append(l10n(html("div", "nyx-vpn-label"), "nyx-vpn-location"));
      locations(view, body, state, chosen);
    }

    // Every workspace, or only this one.
    body.append(l10n(html("div", "nyx-vpn-label"), "nyx-vpn-use-for"));
    const seg = html("div", "nyx-vpn-seg");
    const every = l10n(html("button"), "nyx-vpn-every");
    const only = l10n(html("button"), "nyx-vpn-only", { name: workspaceName });
    const scoped = !!mine && mine !== "none";
    every.toggleAttribute("nyx-on", !scoped);
    only.toggleAttribute("nyx-on", scoped);
    every.addEventListener("click", async () => {
      await NyxVpn.setWorkspace(workspace, "default");
      await NyxVpn.setActive(chosen.id);
      show(view);
    });
    only.addEventListener("click", async () => {
      await NyxVpn.setWorkspace(workspace, chosen.id);
      if (state.active === chosen.id) {
        await NyxVpn.setActive(null);
      }
      show(view);
    });
    seg.append(every, only);
    body.append(seg);

    const settings = l10n(html("button", "nyx-vpn-settings"), "nyx-vpn-settings");
    settings.addEventListener("click", () => {
      CustomizableUI.hidePanelForNode(view);
      openPreferences("paneNyxVpn");
    });
    body.append(settings);
  }

  window.NyxVpnUI = { show };
  const stop = NyxVpn.onChange(showButton);
  gBrowser.tabContainer.addEventListener("TabSelect", showButton);
  window.addEventListener("ZenWorkspacesUIUpdate", showButton);
  window.addEventListener("unload", stop, { once: true });
  showButton();
}
