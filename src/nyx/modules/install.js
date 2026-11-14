/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The install card for .user.css and .user.js: name, where it runs, updates, and Install. */
{
  const HTML = "http://www.w3.org/1999/xhtml";
  const ICONS = "chrome://browser/content/nyx/icons";
  const { INSTALL_TOPIC } = ChromeUtils.importESModule("resource://nyx/actors/NyxSiteParent.sys.mjs");
  const { parseUserStyle, parseUserScript } = ChromeUtils.importESModule("resource://nyx/actors/NyxSiteCode.sys.mjs");
  const { NyxSiteKit } = ChromeUtils.importESModule("chrome://browser/content/nyx/NyxSiteKit.sys.mjs");

  const strings = new Localization(["browser/nyx-browser.ftl"], true);
  const t = (id, args) => strings.formatValueSync(`nyx-site-${id}`, args);

  const el = (tag, cls = "", text = "") => {
    const node = document.createElementNS(HTML, tag);
    if (cls) {
      node.className = cls;
    }
    if (text) {
      node.textContent = text;
    }
    return node;
  };

  let panel = null;

  function card() {
    if (!panel) {
      panel = document.createXULElement("panel");
      panel.id = "nyx-install-card";
      panel.setAttribute("type", "arrow");
      panel.setAttribute("role", "dialog");
      panel.append(el("div", "nyx-ic"));
      document.getElementById("mainPopupSet").append(panel);
    }
    return panel;
  }

  function row(glyph, title, note, trailing = null) {
    const node = el("div", "nyx-ic-row");
    const img = el("img", "nyx-ic-glyph");
    img.src = `${ICONS}/${glyph}.svg`;
    img.alt = "";
    const text = el("div", "nyx-ic-row-text");
    text.append(el("b", "", title));
    if (note) {
      text.append(el("span", "", note));
    }
    node.append(img, text);
    if (trailing) {
      node.append(trailing);
    }
    return node;
  }

  function fill(kind, text, pageUrl) {
    const body = card().firstElementChild;
    const style = kind === "style";
    const meta = style ? parseUserStyle(text) : parseUserScript(text);
    const name = meta?.name || (style ? "Untitled style" : "Untitled script");
    const sites = style
      ? Object.keys(meta?.vars || {}).length
        ? `${Object.keys(meta.vars).length} options`
        : ""
      : [...(meta?.match || []), ...(meta?.include || [])].slice(0, 3).join(", ");
    const updateUrl = meta?.updateURL || "";

    const head = el("div", "nyx-ic-head");
    const tile = el("span", "nyx-ic-tile");
    const icon = el("img");
    icon.src = `${ICONS}/${style ? "palette" : "code"}.svg`;
    icon.alt = "";
    tile.append(icon);
    const titles = el("div", "nyx-ic-titles");
    titles.append(
      el("b", "", t(style ? "install-style" : "install-script")),
      el("span", "", name + (meta?.version ? ` · v${meta.version}` : ""))
    );
    head.append(tile, titles);

    const list = el("div", "nyx-ic-list");
    if (style) {
      list.append(row("globe", sites || pageUrl || "—", "Where it applies"));
      if (Object.keys(meta?.vars || {}).length) {
        list.append(row("settings", `${Object.keys(meta.vars).length} options`, "Set them after installing"));
      }
    } else {
      list.append(row("globe", sites || "—", "Runs on"));
      const grants = (meta?.grant || []).filter(g => g !== "none");
      if (grants.length) {
        list.append(row("warning", grants.slice(0, 3).join(", "), "What it may do"));
      }
      if ((meta?.connect || []).length) {
        list.append(row("warning", meta.connect.slice(0, 3).join(", "), "Talks to another site"));
      }
    }
    if (updateUrl) {
      const keep = document.createXULElement("checkbox");
      keep.className = "nyx-switch nyx-switch-only";
      keep.checked = true;
      keep.id = "nyx-install-updates";
      list.append(row("reload", t("install-updates"), updateUrl.replace(/^https?:\/\//, "").split("/")[0], keep));
    }

    const foot = el("div", "nyx-ic-foot");
    const cancel = el("button", "nyx-ic-btn", t("install-cancel"));
    cancel.addEventListener("click", () => panel.hidePopup());
    const install = el("button", "nyx-ic-btn primary", t("install-button"));
    install.addEventListener("click", async () => {
      const keepUpdates = document.getElementById("nyx-install-updates")?.checked !== false;
      try {
        if (style) {
          await NyxSiteKit.addStyle(text, {
            origin: pageUrl || "",
            updateUrl: keepUpdates ? updateUrl : "",
          });
        } else {
          await NyxSiteKit.addScript(text, {
            origin: pageUrl || "",
            updateUrl: keepUpdates ? updateUrl : "",
          });
        }
        panel.hidePopup();
      } catch (error) {
        console.error("Browser: install failed", error);
      }
    });
    foot.append(cancel, install);
    body.replaceChildren(head, list, foot);
  }

  function show(browser, data) {
    fill(data.kind, data.text, data.url);
    const anchor = browser || document.getElementById("identity-icon-box");
    card().openPopup(anchor, "bottomcenter topleft", 0, 8, false, false);
  }

  const observer = {
    observe(subject, topic, data) {
      if (topic !== INSTALL_TOPIC) {
        return;
      }
      try {
        show(subject, JSON.parse(data));
      } catch (error) {
        console.error("Browser: bad install payload", error);
      }
    },
  };
  Services.obs.addObserver(observer, INSTALL_TOPIC);
  window.addEventListener("unload", () => {
    try {
      Services.obs.removeObserver(observer, INSTALL_TOPIC);
    } catch {}
  }, { once: true });
}
