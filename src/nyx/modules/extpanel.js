/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The Extensions panel, about the site in front: a card for the site, Firefox's own notices
 * (blocked extensions, protected sites, safe mode), a row for each extension that's on, with what
 * it may do here and a way to change it, tiles for those that are off and one to get more, and
 * Browser's own Blocking, Passwords and VPN at the foot. A row does what the extension's button
 * does; its ⋯ holds the extension's own menu items, its access to the site, pin, move, Manage,
 * Remove and Report. Firefox's panel holds it, and opens it as it does its list. */
{
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const { OriginControls } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
  const { ExtensionsUI } = ChromeUtils.importESModule("resource:///modules/ExtensionsUI.sys.mjs");
  const HTML = "http://www.w3.org/1999/xhtml";
  const ICONS = "chrome://browser/content/nyx/icons";

  const el = (tag, className, text) => {
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

  const panel = () => document.getElementById("unified-extensions-panel");
  const close = () => PanelMultiView.hidePopup(panel());
  // Firefox's id for an extension's button (makeWidgetId).
  const widgetIdOf = id => `${id.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}-browser-action`;
  const isWeb = uri => /^https?$/.test(uri.scheme);

  /** An icon face: an extension's image, or one of Browser's on a colour. */
  function face({ src, glyph, colour, badge }) {
    const node = el("span", "nyx-ext-face");
    if (colour) {
      node.style.setProperty("--c", colour);
      node.classList.add("nyx-ext-colour");
    }
    const img = el("img");
    img.src = src ?? `${ICONS}/${glyph}.svg`;
    img.alt = "";
    img.addEventListener("error", () => (img.src = `${ICONS}/puzzle.svg`), { once: true });
    node.append(img);
    if (badge) {
      node.append(el("em", "nyx-ext-badge", badge));
    }
    return node;
  }

  /** The extension's toolbar button's look on this tab: its icon and badge, when it has one. */
  function actionLook(policy) {
    const action = policy && gUnifiedExtensions.browserActionFor(policy);
    const data = action?.action?.getContextData(gBrowser.selectedTab);
    if (!data) {
      return { action: null };
    }
    let icon = data.icon;
    if (icon && typeof icon === "object") {
      const sizes = Object.keys(icon).sort((a, b) => b - a);
      icon = icon[sizes.find(s => +s <= 64) ?? sizes.at(-1)];
    }
    if (icon && typeof icon === "object") {
      icon = icon.light ?? icon.dark;
    }
    return { action, icon, badge: data.badgeText || "" };
  }

  /** What an extension may do on the site in front, and the control that changes it. */
  function siteState(policy) {
    const state = OriginControls.getState(policy, gBrowser.selectedTab);
    const { attention } = OriginControls.getAttentionState(policy, window);
    if (state.quarantined) {
      return { line: "nyx-ext-state-quarantined", warn: true };
    }
    if (state.noAccess) {
      return { line: "nyx-ext-state-no-access" };
    }
    if (attention) {
      return { line: "nyx-ext-state-attention", warn: true, attention: true, control: "allow" };
    }
    if (state.allDomains) {
      return { line: "nyx-ext-state-all", control: "every" };
    }
    if (state.alwaysOn && state.whenClicked) {
      return { line: state.hasAccess ? "nyx-ext-state-always" : state.temporaryAccess ? "nyx-ext-state-temporary" : "nyx-ext-state-when-clicked", control: "choice", always: state.hasAccess };
    }
    if (state.alwaysOn) {
      return { line: "nyx-ext-state-always" };
    }
    return { line: state.temporaryAccess ? "nyx-ext-state-temporary" : "nyx-ext-state-when-clicked", control: "clicked" };
  }

  /** Removes an extension once it's confirmed: the same question from the panel and the
   * Extensions page (window.NyxExtensions). Reporting it is its own item. */
  async function removeAddon(addon) {
    const strings = new Localization(["browser/nyx-library.ftl"], true);
    const [title, message, remove] = strings.formatValuesSync([
      { id: "nyx-ext-page-remove-title" },
      { id: "nyx-ext-page-remove-message", args: { name: addon.name } },
      { id: "nyx-ext-page-remove-confirm" },
    ]);
    const prompt = Services.prompt;
    const flags = prompt.BUTTON_POS_0 * prompt.BUTTON_TITLE_IS_STRING + prompt.BUTTON_POS_1 * prompt.BUTTON_TITLE_CANCEL + prompt.BUTTON_POS_1_DEFAULT;
    if (prompt.confirmEx(window, title, message, flags, remove, null, null, null, {}) !== 0) {
      return false;
    }
    await addon.uninstall();
    return true;
  }
  window.NyxExtensions = { remove: removeAddon };

  // ---- the ⋯ menu ----

  let menu = null;
  function extMenu() {
    if (menu) {
      return menu;
    }
    menu = document.createXULElement("menupopup");
    menu.id = "nyx-ext-menu";
    document.getElementById("mainPopupSet").append(menu);
    return menu;
  }

  const menuStrings = new Localization(["browser/nyx-browser.ftl"], true);
  const item = (id, onCommand, { checkbox = false, checked = false, disabled = false, className = "" } = {}) => {
    const node = document.createXULElement("menuitem");
    // Sync label so ephemeral menuitems aren't blank before async Fluent paints.
    const [{ attributes }] = menuStrings.formatMessagesSync([{ id }]);
    if (attributes?.label) {
      node.setAttribute("label", attributes.label);
    }
    l10n(node, id);
    if (className) {
      node.className = className;
    }
    if (checkbox) {
      node.setAttribute("type", "checkbox");
      node.toggleAttribute("checked", checked);
    }
    node.disabled = disabled;
    node.addEventListener("command", onCommand);
    return node;
  };

  /** Opens the menu for an extension: its own items, its access to this site, pin and move, then
   * Manage, Remove and Report. */
  async function openMenu(addon, policy, anchor, view) {
    const popup = extMenu();
    popup.replaceChildren();
    const widgetId = widgetIdOf(addon.id);
    const placement = CustomizableUI.getPlacementOfWidget(widgetId);
    const pinned = !!placement && placement.area !== CustomizableUI.AREA_ADDONS;
    const refill = () => fill(view);

    const pin = item("nyx-ext-menu-pin", async () => {
      await gUnifiedExtensions.pinToToolbar(widgetId, !pinned);
      refill();
    }, { checkbox: true, checked: pinned, className: "unified-extensions-context-menu-pin-to-toolbar" });
    pin.hidden = !placement;
    popup.append(pin);
    if (placement) {
      const siblings = CustomizableUI.getWidgetIdsInArea(placement.area);
      const move = by => async () => {
        CustomizableUI.moveWidgetWithinArea(widgetId, placement.position + (by > 0 ? 2 : -1));
        refill();
      };
      const up = item("nyx-ext-menu-up", move(-1));
      up.hidden = placement.position === 0;
      const down = item("nyx-ext-menu-down", move(1));
      down.hidden = placement.position >= siblings.length - 1;
      popup.append(up, down);
    }
    popup.append(document.createXULElement("menuseparator"));
    popup.append(
      item("nyx-ext-menu-manage", () => {
        close();
        BrowserAddonUI.manageAddon(addon.id, "unifiedExtensions");
      }),
      item("nyx-ext-menu-remove", () => {
        close();
        removeAddon(addon);
      }, { disabled: !(addon.permissions & AddonManager.PERM_CAN_UNINSTALL) })
    );
    if (gAddonAbuseReportEnabled) {
      popup.append(
        item("nyx-ext-menu-report", () => {
          close();
          BrowserAddonUI.reportAddon(addon.id, "unified_context_menu");
        })
      );
    }
    // Firefox's own parts: the site's access options go before pin, the extension's items first.
    if (policy?.active) {
      ExtensionsUI.originControlsMenu(popup, addon.id);
      gUnifiedExtensions.browserActionFor(policy)?.updateContextMenu(popup);
    }
    popup.addEventListener("popuphidden", e => e.target === popup && refill(), { once: true });
    popup.openPopup(anchor, "after_end", 0, 2, true);
  }

  // ---- the panel ----

  function builtIns() {
    const box = el("div", "nyx-ext-built");
    const shield = document.getElementById("nyx-shield-button");
    const blocked = shield?.querySelector(".nyx-shield-count")?.value;
    const vpnOn = document.getElementById("nyx-vpn-button")?.hasAttribute("nyx-on");
    const tile = (glyph, colour, nameId, on, stateId, stateArgs, run) => {
      const node = el("button", "nyx-ext-builtin");
      node.toggleAttribute("nyx-on", on);
      node.style.setProperty("--c", colour);
      const img = el("img");
      img.src = `${ICONS}/${glyph}.svg`;
      img.alt = "";
      node.append(img, l10n(el("b"), nameId), l10n(el("span"), stateId, stateArgs));
      node.addEventListener("click", () => {
        close();
        run();
      });
      return node;
    };
    box.append(
      tile("shield", "var(--nyx-swatch-coral, #f07b58)", "nyx-ext-blocking", !shield?.hasAttribute("nyx-off"), blocked ? "nyx-ext-blocked-count" : "nyx-ext-built-in", { count: Number(blocked) || 0 }, () =>
        document.getElementById("nyx-shield-button")?.click()
      ),
      tile("key", "var(--nyx-swatch-violet, #8b5cf6)", "nyx-ext-passwords", true, "nyx-ext-built-in", null, () => window.NyxPasswordsUI?.openPopup()),
      tile("globe", "var(--nyx-swatch-teal, #2bb3a8)", "nyx-ext-vpn", !!vpnOn, vpnOn ? "nyx-ext-on" : "nyx-ext-off", null, () =>
        PanelUI.showSubView("PanelUI-nyx-vpn", document.getElementById("unified-extensions-button"))
      )
    );
    return box;
  }

  function siteCard() {
    const uri = gBrowser.currentURI;
    const priv = PrivateBrowsingUtils.isWindowPrivate(window);
    const head = el("div", "nyx-ext-head");
    const icon = el("span", "nyx-ext-site");
    if (priv) {
      icon.classList.add("nyx-ext-glyph");
      icon.style.setProperty("--src", `url("${ICONS}/private.svg")`);
    } else if (gBrowser.selectedTab.image) {
      const img = el("img");
      img.src = gBrowser.selectedTab.image;
      img.alt = "";
      icon.append(img);
    } else {
      icon.classList.add("nyx-ext-glyph");
      icon.style.setProperty("--src", `url("${ICONS}/globe.svg")`);
    }
    const text = el("div", "nyx-ext-head-text");
    const title = el("b");
    if (priv) {
      l10n(title, "nyx-ext-private");
    } else if (isWeb(uri)) {
      title.textContent = uri.displayHost.replace(/^www\./, "");
    } else {
      title.textContent = gBrowser.selectedTab.label;
    }
    text.append(title, l10n(el("span"), isWeb(uri) ? "nyx-ext-sub" : "nyx-ext-sub-page"));
    const manage = l10n(el("button", "lnk"), "nyx-ext-manage");
    manage.addEventListener("click", () => {
      close();
      BrowserAddonUI.openAddonsMgr("addons://list/extension");
    });
    head.append(icon, text, manage);
    return head;
  }

  async function fill(view) {
    let box = view.querySelector(":scope > #nyx-ext");
    if (!box) {
      box = el("div", "nyx-ext");
      box.id = "nyx-ext";
      view.prepend(box);
    }
    const priv = PrivateBrowsingUtils.isWindowPrivate(window);
    const addons = (await AddonManager.getAddonsByTypes(["extension"])).filter(a => !a.hidden && !a.isBuiltin && !a.isSystem);
    // Rows in the order of their buttons: pinned first, then the panel's own order, then the rest.
    const order = [...CustomizableUI.getWidgetIdsInArea(CustomizableUI.AREA_NAVBAR), ...CustomizableUI.getWidgetIdsInArea(CustomizableUI.AREA_ADDONS)];
    const rank = a => {
      const i = order.indexOf(widgetIdOf(a.id));
      return i < 0 ? order.length : i;
    };
    addons.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    const on = addons.filter(a => a.isActive);
    const off = addons.filter(a => !a.isActive);

    const parts = [siteCard()];
    // Firefox's notices: safe mode, blocked extensions, protected sites. It fills them in.
    const notices = view.querySelector("#unified-extensions-messages-container");
    if (notices) {
      notices.classList.add("nyx-ext-notices");
      parts.push(notices);
    }

    if (!addons.length) {
      const empty = el("div", "nyx-ext-empty");
      const get = l10n(el("button", "nyx-ext-primary"), "nyx-ext-get");
      get.addEventListener("click", () => {
        close();
        openTrustedLinkIn(Services.urlFormatter.formatURLPref("extensions.getAddons.link.url"), "tab");
      });
      empty.append(el("span", "nyx-ext-empty-icon"), l10n(el("b"), "nyx-ext-empty-title"), l10n(el("span"), "nyx-ext-empty-text"), get);
      parts.push(empty);
    }

    if (on.length) {
      const group = el("div", "nyx-ext-group");
      group.append(l10n(el("div", "nyx-ext-label"), "nyx-ext-on-site"));
      for (const addon of on) {
        const policy = WebExtensionPolicy.getByID(addon.id);
        const blockedHere = priv && policy && !policy.privateBrowsingAllowed;
        const look = actionLook(policy);
        const state = blockedHere ? { line: "nyx-ext-state-private" } : policy ? siteState(policy) : { line: "nyx-ext-state-no-access" };
        const row = el("div", "nyx-ext-row");
        row.setAttribute("role", "button");
        row.toggleAttribute("nyx-off", !!blockedHere);
        const icon = face({ src: look.icon ?? addon.iconURL, badge: blockedHere ? "" : look.badge });
        if (state.attention) {
          icon.append(el("span", "nyx-ext-dot"));
        }
        const text = el("span", "nyx-ext-row-text");
        const line = l10n(el("span"), state.line);
        line.toggleAttribute("nyx-warn", !!state.warn);
        text.append(el("b", "", addon.name), line);
        row.append(icon, text);

        const uri = gBrowser.currentURI;
        if (state.control === "choice") {
          const seg = el("span", "nyx-ext-seg");
          const clicked = l10n(el("button"), "nyx-ext-when-clicked");
          const always = l10n(el("button"), "nyx-ext-always");
          clicked.toggleAttribute("nyx-on", !state.always);
          always.toggleAttribute("nyx-on", !!state.always);
          clicked.addEventListener("click", async e => {
            e.stopPropagation();
            await OriginControls.setWhenClicked(policy, uri);
            gUnifiedExtensions.updateAttention();
            fill(view);
          });
          always.addEventListener("click", async e => {
            e.stopPropagation();
            await OriginControls.setAlwaysOn(policy, uri);
            gUnifiedExtensions.updateAttention();
            fill(view);
          });
          seg.append(clicked, always);
          row.append(seg);
        } else if (state.control === "allow") {
          const allow = l10n(el("button", "nyx-ext-allow"), "nyx-ext-allow");
          allow.addEventListener("click", async e => {
            e.stopPropagation();
            await OriginControls.setAlwaysOn(policy, uri);
            gUnifiedExtensions.updateAttention();
            fill(view);
          });
          row.append(allow);
        } else if (state.control === "every" || state.control === "clicked") {
          row.append(l10n(el("span", "nyx-ext-chip"), state.control === "every" ? "nyx-ext-every-site" : "nyx-ext-when-clicked"));
        }
        const more = l10n(el("button", "nyx-ext-more"), "nyx-ext-more", { name: addon.name });
        more.addEventListener("click", e => {
          e.stopPropagation();
          openMenu(addon, policy, more, view);
        });
        row.append(more);
        row.addEventListener("click", () => {
          close();
          if (look.action && !blockedHere) {
            look.action.triggerAction(window);
          } else {
            BrowserAddonUI.openAddonsMgr(`addons://detail/${encodeURIComponent(addon.id)}`);
          }
        });
        row.addEventListener("contextmenu", e => {
          e.preventDefault();
          openMenu(addon, policy, more, view);
        });
        group.append(row);
      }
      parts.push(group);
    }

    if (addons.length) {
      const grid = el("div", "nyx-ext-grid");
      const tile = (faceNode, name, nameId, stateId, run, menuFor) => {
        const node = el("button", "nyx-ext-tile");
        const b = el("b", "", name ?? "");
        if (nameId) {
          l10n(b, nameId);
        }
        node.append(faceNode, b, l10n(el("span"), stateId));
        node.addEventListener("click", () => {
          close();
          run();
        });
        if (menuFor) {
          node.addEventListener("contextmenu", e => {
            e.preventDefault();
            openMenu(menuFor, null, node, view);
          });
        }
        return node;
      };
      for (const addon of off) {
        const blocked = addon.blocklistState === Ci.nsIBlocklistService.STATE_BLOCKED;
        const t = tile(face({ src: addon.iconURL }), addon.name, null, blocked ? "nyx-ext-blocked" : "nyx-ext-off", () =>
          BrowserAddonUI.openAddonsMgr(`addons://detail/${encodeURIComponent(addon.id)}`), addon);
        t.toggleAttribute("nyx-off", true);
        grid.append(t);
      }
      grid.append(
        tile(face({ glyph: "plus" }), null, "nyx-ext-get-more", "nyx-ext-addons-site", () =>
          openTrustedLinkIn(Services.urlFormatter.formatURLPref("extensions.getAddons.link.url"), "tab"))
      );
      parts.push(grid);
    }

    parts.push(builtIns());
    box.replaceChildren(...parts);
  }

  // Firefox makes the panel the first time it opens it.
  window.addEventListener(
    "popupshowing",
    event => {
      if (event.target.id === "unified-extensions-panel") {
        // Zen renames the panel's view (ZenSiteDataPanel.sys.mjs).
        const view = event.target.querySelector("#original-unified-extensions-view, #unified-extensions-view");
        if (view) {
          fill(view);
        }
      }
    },
    true
  );
}
