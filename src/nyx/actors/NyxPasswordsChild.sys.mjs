/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Nyx Passwords in a page's frame: it notices login, sign-up, one-time-code, card and address
// fields, puts the key in login fields, asks the window for the menu under one, fills what the
// window hands it, reports submitted logins for the save bar, and answers passkey requests for
// the page. It never sees a vault value but those it's asked to fill.
//
// Unlike a content script it sees what a page hides: fields inside web components (open or
// closed shadow roots), sign-ins in dialogs with no <form>, fields the page makes read-only until
// they're clicked, and it fills as typing does (setUserInput), so pages built on frameworks take
// the values. The menu and the save bar are the window's, drawn above the page, so a dialog's
// focus trap or stacking can't hide them.

import { clearInterval, clearTimeout, setInterval, setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const SVG = "http://www.w3.org/2000/svg";
const KEY_PATH = "M7 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 1 0 0-8.4M11.2 12H22M19.2 12v3.6M15.9 12v2.7";
const ICONS_PREF = "nyx.passwords.field-icons";
const PASSKEYS_PREF = "nyx.passwords.passkeys";
const ACCENT_PREF = "nyx.passwords.accent";

const textLike = el => ["text", "email", "tel", ""].includes(el.type);
const describe = el => `${el.name} ${el.id} ${el.placeholder ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.autocomplete ?? ""}`.toLowerCase();
const USERNAME_WORDS = /user|login|e.?mail|account|identifier|signin|sign.?in|session.?key|loginfmt|member/;

/** Every input under `root`, inside shadow roots (open or closed) too, in document order. */
function deepInputs(root) {
  const out = [];
  const walk = node => {
    const doc = node.ownerDocument ?? node;
    const walker = doc.createTreeWalker(node, 1 /* NodeFilter.SHOW_ELEMENT */);
    for (let el = walker.currentNode; el; el = walker.nextNode()) {
      if (el.localName === "input") {
        out.push(el);
      }
      const shadow = el.openOrClosedShadowRoot;
      if (shadow) {
        walk(shadow);
      }
    }
  };
  walk(root);
  return out;
}

/** Shown on screen and usable. Read-only isn't a reason: some pages unlock a field on click. */
function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true }) && !el.disabled;
}

/** The element's parent, through shadow roots to their hosts. */
const composedParent = el => el.parentElement ?? el.getRootNode()?.host ?? null;

/** The dialog an element is in (a modal, a popover, or one drawn as a dialog), or null. */
function dialogOf(el) {
  for (let node = el; node; node = composedParent(node)) {
    if (node.localName === "dialog" || ["dialog", "alertdialog"].includes(node.getAttribute?.("role")) || node.getAttribute?.("aria-modal") === "true") {
      return node;
    }
  }
  return null;
}

/** Where a field's partners are: its form, else its dialog, else the whole page. */
const scopeOf = el => el.form ?? dialogOf(el) ?? el.ownerDocument;

/** The top layer a field shows in (a modal dialog, an open popover), where the key must go. */
function topLayerOf(el) {
  for (let node = el; node; node = composedParent(node)) {
    try {
      if (node.matches?.("dialog:modal, :popover-open")) {
        return node;
      }
    } catch {}
  }
  return null;
}

export class NyxPasswordsChild extends JSWindowActorChild {
  #lastInput = 0;
  #anchor = null;
  #filling = 0;
  #icons = new Map();
  #iconTimer = null;
  #scanTimer = null;
  #askedFor = "";
  #blurTimer = null;

  /** A web page's frame (or one it wrote itself, which has its principal). */
  #web() {
    const principal = this.document?.nodePrincipal;
    return !!principal && (principal.schemeIs("https") || principal.schemeIs("http"));
  }

  handleEvent(event) {
    if (!this.#web()) {
      return;
    }
    switch (event.type) {
      case "DOMWindowCreated":
        this.#installPasskeys();
        break;
      case "pointerdown":
      case "keydown":
        if (event.isTrusted) {
          this.#lastInput = Date.now();
        }
        if (event.type === "keydown") {
          this.#keydown(event);
        }
        break;
      case "focusin":
        this.#focusin(event);
        break;
      case "focusout":
        this.#focusout(event);
        break;
      case "click":
        this.#click(event);
        break;
      case "submit":
        this.#capture(event.originalTarget);
        break;
      case "DOMContentLoaded":
      case "pageshow":
      case "DOMFormHasPassword":
      case "DOMInputPasswordAdded":
      case "load":
        this.#scanSoon();
        break;
      case "scroll":
        this.#placeIcons();
        break;
      case "pagehide":
        this.#clearIcons();
        break;
    }
  }

  didDestroy() {
    this.#clearIcons();
    clearTimeout(this.#scanTimer);
  }

  // ---- what a field is ----

  #targetOf(event) {
    return event.composedTarget ?? event.originalTarget ?? event.target;
  }

  /** What a field is for, or null. */
  #kindOf(el) {
    if (el?.localName !== "input" || !visible(el)) {
      return null;
    }
    const ac = (el.autocomplete || "").toLowerCase();
    const t = describe(el);
    if (ac.includes("one-time-code") || /(^|[^a-z])(otp|totp|2fa|mfa)|one.?time|verification.?code|auth.?code/.test(t)) {
      return "otp";
    }
    if (ac.startsWith("cc-") || /card.?number|cc.?num|cvc|cvv|csc|card.?holder|expir/.test(t)) {
      return "card";
    }
    const scope = scopeOf(el);
    if (el.type === "password") {
      const passwords = deepInputs(scope).filter(i => i.type === "password" && visible(i));
      return ac.includes("new-password") || passwords.length > 1 || /new|confirm|repeat|create/.test(t) ? "new-password" : "login";
    }
    if (textLike(el)) {
      if (ac.includes("username") || ac === "webauthn") {
        return "login";
      }
      if (/email|tel/.test(ac) || USERNAME_WORDS.test(t) || el.type === "email") {
        // A username with a password near it (in its form or dialog, else on the page), or a
        // sign-in's first step: one or two fields and a Next or Sign in button.
        const near = deepInputs(scope).some(i => i.type === "password" && visible(i));
        const page = near || (scope === el.ownerDocument ? false : deepInputs(el.ownerDocument).some(i => i.type === "password" && visible(i)));
        if (near || page || this.#signInStep(scope)) {
          return "login";
        }
      }
      if (/given-name|family-name|street-address|address-line|postal-code|country/.test(ac) || /first.?name|last.?name|address|postal|zip|city/.test(t)) {
        return "identity";
      }
    }
    return null;
  }

  #signInStep(scope) {
    if (!scope || scope === this.document) {
      return false;
    }
    const fields = deepInputs(scope).filter(i => visible(i) && !["hidden", "checkbox", "radio", "submit", "button", "search"].includes(i.type));
    if (!fields.length || fields.length > 2) {
      return false;
    }
    const labels = [...scope.querySelectorAll('button, input[type="submit"], [role="button"], a')]
      .map(b => `${b.textContent} ${b.value ?? ""} ${b.getAttribute("aria-label") ?? ""}`)
      .join(" ");
    return /next|continue|sign.?in|log.?in/i.test(labels) && !/subscribe|newsletter|join|sign.?up|register/i.test(labels);
  }

  // ---- the menu ----

  #byUser() {
    return Date.now() - this.#lastInput < 1500 || this.contentWindow?.navigator.userActivation?.isActive;
  }

  #focusin(event) {
    const el = this.#targetOf(event);
    clearTimeout(this.#blurTimer);
    const kind = this.#kindOf(el);
    if (!kind) {
      return;
    }
    if (["login", "new-password", "otp"].includes(kind)) {
      this.#icon(el, kind);
      // Its partners may have been hidden when they were added (a dialog that just opened).
      this.#scanSoon();
    }
    // The menu opens for the person, not for the page: after a click or a key, never on a field
    // the page focused itself or one a fill just moved the cursor to. The key always opens it.
    if (this.#byUser() && Date.now() - this.#filling > 600) {
      this.#openMenu(el, kind, false);
    }
  }

  #focusout(event) {
    if (this.#targetOf(event) !== this.#anchor) {
      return;
    }
    this.#blurTimer = setTimeout(() => this.sendAsyncMessage("NyxPasswords:Blur"), 200);
  }

  #click(event) {
    if (!event.isTrusted) {
      return;
    }
    const el = this.#targetOf(event);
    // A click in the field that already has the cursor (the page put it there, or the menu was
    // closed with Escape) opens the menu too.
    if (el?.localName === "input" && el === this.#deepActive() && el !== this.#anchor) {
      const kind = this.#kindOf(el);
      if (kind) {
        this.#openMenu(el, kind, true);
      }
    }
    this.#clickedButton(el);
  }

  #keydown(event) {
    const el = this.#targetOf(event);
    if (event.key === "Escape" && this.#anchor) {
      this.#anchor = null;
      this.sendAsyncMessage("NyxPasswords:Blur");
    }
    // Enter in a sign-in field, where the page signs in without a form submit.
    if (event.key === "Enter" && el?.localName === "input" && (el.type === "password" || this.#kindOf(el) === "login")) {
      this.#capture(el.form ?? dialogOf(el) ?? null);
    }
  }

  #deepActive() {
    let active = this.document.activeElement;
    while (active?.openOrClosedShadowRoot?.activeElement) {
      active = active.openOrClosedShadowRoot.activeElement;
    }
    return active;
  }

  /** The field's place on screen, in device pixels, for the window's menu. */
  #screenRect(el) {
    const win = this.contentWindow;
    const r = el.getBoundingClientRect();
    const scale = win.devicePixelRatio;
    return {
      left: (win.mozInnerScreenX + r.left) * scale,
      right: (win.mozInnerScreenX + r.right) * scale,
      top: (win.mozInnerScreenY + r.top) * scale,
      bottom: (win.mozInnerScreenY + r.bottom) * scale,
    };
  }

  #openMenu(el, field, asked) {
    this.#anchor = el;
    this.sendQuery("NyxPasswords:Field", { field, asked, rect: this.#screenRect(el) }).catch(() => {});
  }

  // ---- the key in login fields ----

  #accent() {
    const [accent, onAccent] = Services.prefs.getStringPref(ACCENT_PREF, "#3d8ae8 #0d0e12").split(" ");
    return { accent, onAccent };
  }

  #icon(el, kind) {
    if (!Services.prefs.getBoolPref(ICONS_PREF, true) || this.#icons.has(el)) {
      return;
    }
    const doc = this.document;
    const host = doc.createElement("nyx-passwords-key");
    const shadow = host.attachShadow({ mode: "closed" });
    const { accent, onAccent } = this.#accent();
    host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; display: block; margin: 0; padding: 0; border: 0; pointer-events: auto;";
    const button = doc.createElement("button");
    button.setAttribute("aria-label", "Nyx Passwords");
    button.setAttribute("title", "Nyx Passwords");
    button.style.cssText = `all: initial; box-sizing: border-box; display: grid; place-items: center; width: 100%; height: 100%; border-radius: 6px; background: ${accent}; cursor: pointer;`;
    const svg = doc.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "70%");
    svg.setAttribute("height", "70%");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", onAccent);
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const path = doc.createElementNS(SVG, "path");
    path.setAttribute("d", KEY_PATH);
    svg.append(path);
    button.append(svg);
    shadow.append(button);
    // The field keeps the cursor; the key opens the menu under it.
    button.addEventListener("mousedown", e => {
      e.preventDefault();
      e.stopPropagation();
    }, true);
    button.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      el.focus();
      this.#openMenu(el, this.#kindOf(el) ?? kind, true);
    }, true);
    (topLayerOf(el) ?? doc.documentElement).append(host);
    this.#icons.set(el, host);
    this.#placeIcons();
    this.#iconTimer ??= setInterval(() => this.#placeIcons(), 400);
  }

  #placeIcons() {
    for (const [el, host] of this.#icons) {
      if (!el.isConnected || !host.isConnected || !visible(el)) {
        host.remove();
        this.#icons.delete(el);
        continue;
      }
      const r = el.getBoundingClientRect();
      const size = Math.max(16, Math.min(22, r.height - 8));
      host.style.width = host.style.height = `${size}px`;
      host.style.left = `${r.right - size - Math.min(8, (r.height - size) / 2 + 2)}px`;
      host.style.top = `${r.top + (r.height - size) / 2}px`;
    }
    if (!this.#icons.size) {
      clearInterval(this.#iconTimer);
      this.#iconTimer = null;
    }
  }

  #clearIcons() {
    for (const host of this.#icons.values()) {
      host.remove();
    }
    this.#icons.clear();
    clearInterval(this.#iconTimer);
    this.#iconTimer = null;
  }

  // ---- the page as it loads: keys in its login fields, and filling once ----

  #scanSoon() {
    clearTimeout(this.#scanTimer);
    this.#scanTimer = setTimeout(() => this.#scan(), 300);
  }

  #scan() {
    if (!this.document || !this.contentWindow) {
      return;
    }
    const passwords = deepInputs(this.document).filter(i => i.type === "password" && visible(i));
    if (!passwords.length) {
      return;
    }
    for (const password of passwords) {
      const kind = this.#kindOf(password);
      if (kind) {
        this.#icon(password, kind);
      }
      const scope = deepInputs(scopeOf(password)).filter(visible);
      const before = scope.slice(0, scope.indexOf(password)).reverse();
      const user = before.find(i => textLike(i) && this.#kindOf(i) === "login");
      if (user) {
        this.#icon(user, "login");
      }
    }
    const login = passwords.find(p => this.#kindOf(p) === "login");
    if (login && this.#askedFor !== this.document.location.href) {
      this.#askedFor = this.document.location.href;
      this.sendAsyncMessage("NyxPasswords:Loaded");
    }
  }

  // ---- submitted logins ----

  #capture(scope) {
    const fields = deepInputs(scope ?? this.document).filter(el => el.getClientRects().length > 0);
    const passwords = fields.filter(el => el.type === "password" && el.value);
    if (!passwords.length) {
      this.#captureUsernameStep(scope, fields);
      return;
    }
    // A change-password form: current, then new (and confirm). A sign-up's two are the same.
    const chosen = passwords.find(el => el.autocomplete === "new-password") ?? passwords.at(-1);
    const current =
      passwords.find(el => el.autocomplete === "current-password" && el !== chosen) ??
      (passwords.length >= 2 && passwords[0].value !== chosen.value ? passwords[0] : null);
    const before = fields.slice(0, fields.indexOf(passwords[0])).reverse();
    // Sites put a hidden username field beside a password step for password managers.
    const user =
      before.find(el => /username|email/.test(el.autocomplete) && el.value) ??
      before.find(el => textLike(el) && el.value) ??
      deepInputs(scope ?? this.document).find(el => /\busername\b/.test(el.autocomplete) && el.type !== "password" && el.value);
    this.sendAsyncMessage("NyxPasswords:Submitted", { username: user?.value ?? "", password: chosen.value, current: current?.value ?? "", change: Boolean(current) });
  }

  #captureUsernameStep(scope, fields) {
    if (!scope || !this.#signInStep(scope)) {
      return;
    }
    const user =
      fields.find(el => /username|email/.test(el.autocomplete) && el.value) ??
      fields.find(el => textLike(el) && el.value && USERNAME_WORDS.test(describe(el)));
    if (user) {
      this.sendAsyncMessage("NyxPasswords:UsernameStep", { username: user.value });
    }
  }

  #clickedButton(el) {
    const button = el?.closest?.('a, button, input[type="submit"], [role="button"]');
    if (!button) {
      return;
    }
    const label = `${button.textContent} ${button.value ?? ""} ${button.getAttribute("aria-label") ?? ""}`;
    if (button.localName !== "a" && /log.?in|sign.?(in|up)|register|create|continue|next|submit|save/i.test(label)) {
      this.#capture(button.closest("form") ?? dialogOf(button));
    }
    // Universal sign-on: "Sign in with Google" and the like.
    const href = button.href ?? button.closest("a")?.href ?? "";
    const providers = {
      google: /google/i, apple: /apple/i, microsoft: /microsoft|outlook/i, github: /github/i, facebook: /facebook/i,
      gitlab: /gitlab/i, twitter: /twitter/i, linkedin: /linkedin/i, amazon: /amazon/i, slack: /slack/i,
    };
    const domains = {
      google: /accounts\.google\.com/, apple: /appleid\.apple\.com/, microsoft: /login\.(microsoftonline|live)\.com/,
      github: /github\.com\/login\/oauth/, facebook: /facebook\.com\/.*oauth/, gitlab: /gitlab\.com\/oauth/,
    };
    for (const [name, word] of Object.entries(providers)) {
      if ((word.test(label) && /sign|log|continue|with/i.test(label)) || domains[name]?.test(href)) {
        this.sendAsyncMessage("NyxPasswords:Provider", { provider: name });
        break;
      }
    }
  }

  // ---- filling, as the window asks ----

  receiveMessage({ name, data }) {
    if (!this.#web()) {
      return null;
    }
    const sameOrigin = () => this.document?.nodePrincipal.origin === data?.origin || this.document?.location.origin === data?.origin;
    switch (name) {
      case "NyxPasswords:LoginFormHere":
        return deepInputs(this.document).some(el => visible(el) && (el.type === "password" || /username/.test(el.autocomplete)));
      case "NyxPasswords:PasswordFieldShown":
        return deepInputs(this.document).some(el => el.type === "password" && el.getClientRects().length > 0 && !el.disabled);
      case "NyxPasswords:ReadForm":
        return this.#readForm();
      case "NyxPasswords:FillLogin":
        return sameOrigin() && this.#fillLogin(data.username, data.password, data.onLoad);
      case "NyxPasswords:FillNew":
        return sameOrigin() ? this.#fillNew(data.password) : 0;
      case "NyxPasswords:FillUsername":
        return sameOrigin() && this.#fillUsername(data.value);
      case "NyxPasswords:FillCode":
        return sameOrigin() && this.#fillCode(data.code);
      case "NyxPasswords:FillForm":
        return sameOrigin() ? this.#fillForm(data.kind, data.values) : 0;
      case "NyxPasswords:ClickProvider":
        return sameOrigin() && this.#clickProvider(data.provider);
    }
    return null;
  }

  /** The fields a fill keeps to: the menu's field's form or dialog, else the whole page. */
  #fields() {
    const all = deepInputs(this.document).filter(visible);
    const anchor = this.#anchor?.isConnected ? this.#anchor : this.#deepActive();
    if (anchor?.localName === "input") {
      const scope = scopeOf(anchor);
      if (scope !== this.document) {
        const inScope = deepInputs(scope).filter(visible);
        if (inScope.some(el => el.type === "password" || textLike(el))) {
          return inScope;
        }
      }
    }
    return all;
  }

  #set(el, value, { focus = true } = {}) {
    if (!el || !value || el.readOnly) {
      return false;
    }
    this.#filling = Date.now();
    if (focus) {
      el.focus();
    }
    el.setUserInput(value);
    return true;
  }

  #fillLogin(username, password, onLoad) {
    const fields = this.#fields();
    const passwordField = fields.find(el => el.type === "password" && el.autocomplete !== "new-password") ?? fields.find(el => el.type === "password");
    const named = el => USERNAME_WORDS.test(describe(el));
    const before = passwordField ? fields.slice(0, fields.indexOf(passwordField)).reverse() : [];
    const userField = passwordField
      ? before.find(el => /username|email/.test(el.autocomplete)) ?? before.find(textLike)
      : fields.find(el => /username|email/.test(el.autocomplete)) ?? fields.find(el => textLike(el) && (el.type === "email" || named(el))) ?? fields.find(textLike);
    const active = this.#deepActive();
    // As the page loads, the cursor stays where it is, and a field already typed in is left alone.
    const put = (el, value) => {
      if (onLoad && (!el || el.value || el === active)) {
        return false;
      }
      return this.#set(el, value, { focus: !onLoad });
    };
    const a = put(userField, username);
    const b = put(passwordField, password);
    return a || b;
  }

  #fillNew(password) {
    const fields = this.#fields().filter(el => el.type === "password");
    const current = el => el.autocomplete === "current-password" || /current|old/i.test(`${el.name} ${el.id}`);
    let targets = fields.filter(el => !current(el));
    const marked = targets.filter(el => el.autocomplete === "new-password");
    if (marked.length) {
      targets = marked;
    } else if (targets.length === 3) {
      targets = targets.slice(1);
    }
    for (const el of targets) {
      this.#set(el, password, { focus: false });
    }
    targets[0]?.focus();
    return targets.length;
  }

  #fillUsername(value) {
    const fields = this.#fields();
    const anchor = this.#anchor?.isConnected ? this.#anchor : this.#deepActive();
    const password = fields.findIndex(el => el.type === "password");
    const before = password < 0 ? fields : fields.slice(0, password);
    const field =
      (anchor && textLike(anchor) && fields.includes(anchor) ? anchor : null) ??
      before.find(el => /username|email/.test(el.autocomplete)) ??
      before.find(el => textLike(el) && USERNAME_WORDS.test(describe(el))) ??
      before.findLast(textLike);
    return this.#set(field, value);
  }

  #fillCode(code) {
    const inputs = deepInputs(this.document).filter(visible);
    const boxes = inputs.filter(el => el.maxLength === 1);
    if (boxes.length >= code.length) {
      code.split("").forEach((c, i) => this.#set(boxes[i], c, { focus: false }));
      return true;
    }
    const field =
      inputs.find(el => el.autocomplete === "one-time-code") ??
      inputs.find(el => /otp|totp|2fa|mfa|one.?time|verification|security.?code|auth.?code|token/i.test(`${el.name} ${el.id} ${el.placeholder}`));
    return this.#set(field, code);
  }

  #fillForm(kind, values) {
    const map =
      kind === "card"
        ? [
            ["cc-name", /card.?holder|name.?on.?card|cc.?name/i, values.cardholderName],
            ["cc-number", /card.?number|cc.?num|cardnum/i, values.number],
            ["cc-exp-month", /exp.*month|month/i, values.expMonth],
            ["cc-exp-year", /exp.*year|year/i, values.expYear],
            ["cc-exp", /expir|exp.?date|mm.?yy/i, values.expMonth && values.expYear ? `${values.expMonth.padStart(2, "0")}/${values.expYear.slice(-2)}` : ""],
            ["cc-csc", /cvc|cvv|csc|security.?code/i, values.code],
          ]
        : [
            ["given-name", /first.?name|given/i, values.firstName],
            ["additional-name", /middle/i, values.middleName],
            ["family-name", /last.?name|surname|family/i, values.lastName],
            ["email", /e.?mail/i, values.email],
            ["tel", /phone|tel/i, values.phone],
            ["organization", /company|organi[sz]ation/i, values.company],
            ["address-line1", /address.?1|street|address$/i, values.address1],
            ["address-line2", /address.?2/i, values.address2],
            ["address-level2", /city|town/i, values.city],
            ["address-level1", /state|province|region/i, values.state],
            ["postal-code", /zip|postal|postcode/i, values.postalCode],
            ["country", /country/i, values.country],
            ["username", /user.?name/i, values.username],
          ];
    const inputs = [...deepInputs(this.document), ...this.document.querySelectorAll("select")].filter(visible);
    let n = 0;
    for (const [token, pattern, value] of map) {
      if (!value) {
        continue;
      }
      const el =
        inputs.find(i => (i.autocomplete || "").split(" ").includes(token)) ??
        inputs.find(i => !i.autocomplete && pattern.test(`${i.name} ${i.id} ${i.placeholder ?? ""} ${i.getAttribute("aria-label") ?? ""}`));
      // A dropdown always has a value (its first option), so only text fields count as typed in.
      if (!el || (el.localName !== "select" && el.value)) {
        continue;
      }
      if (el.localName === "select") {
        const option = [...el.options].find(o => o.value === value || o.text.trim() === value || o.value === value.padStart(2, "0"));
        if (!option) {
          continue;
        }
        el.value = option.value;
        el.dispatchEvent(new this.contentWindow.Event("change", { bubbles: true }));
      } else {
        this.#set(el, value, { focus: false });
      }
      n++;
    }
    return n;
  }

  #clickProvider(provider) {
    const words = { google: /google/i, apple: /apple/i, microsoft: /microsoft|outlook|live\.com/i, github: /github/i, facebook: /facebook|meta/i, gitlab: /gitlab/i, twitter: /twitter|\bx\b/i, linkedin: /linkedin/i, amazon: /amazon/i, slack: /slack/i }[provider];
    if (!words) {
      return false;
    }
    const candidates = [...this.document.querySelectorAll("a, button, [role=button], input[type=submit]")].filter(el => el.getClientRects().length > 0);
    const el = candidates.find(c => {
      const text = `${c.textContent} ${c.getAttribute("aria-label") ?? ""} ${c.getAttribute("title") ?? ""} ${c.value ?? ""} ${c.href ?? ""}`;
      return words.test(text) && /sign|log|continue|with|auth|oauth/i.test(text);
    });
    el?.click();
    return !!el;
  }

  #readForm() {
    const fields = deepInputs(this.document).filter(el => el.getClientRects().length > 0);
    const passwordField = fields.find(el => el.type === "password" && el.value);
    if (!passwordField) {
      return null;
    }
    const nearestFirst = fields.slice(0, fields.indexOf(passwordField)).reverse();
    const userField =
      nearestFirst.find(el => /username|email/.test(el.autocomplete) && el.value) ?? nearestFirst.find(el => textLike(el) && el.value);
    return { username: userField?.value ?? "", password: passwordField.value };
  }

  // ---- passkeys ----

  /**
   * navigator.credentials.get and .create for public keys go to Nyx Passwords first, from before
   * the page's own scripts run, so there's no race with them. With nothing saved, or when the
   * person picks a security key, the browser's own runs. The script runs in a sandbox with the
   * page's own principal (as the page's world), and reaches Browser through `nyxAsk` only.
   */
  #installPasskeys() {
    const win = this.contentWindow;
    if (!Services.prefs.getBoolPref(PASSKEYS_PREF, true) || !win?.isSecureContext || !win.navigator.credentials) {
      return;
    }
    const sandbox = Cu.Sandbox(this.document.nodePrincipal, {
      sandboxPrototype: win,
      wantXrays: false,
      sameZoneAs: win,
      sandboxName: "Nyx Passwords: passkeys",
    });
    Cu.exportFunction(
      (kind, json, reply) => {
        let options = {};
        try {
          options = JSON.parse(json);
        } catch {}
        this.sendQuery("NyxPasswords:Passkey", { kind, options }).then(
          answer => reply(JSON.stringify(answer ?? { fallback: true })),
          () => reply('{"fallback":true}')
        );
      },
      sandbox,
      { defineAs: "nyxAsk" }
    );
    Cu.evalInSandbox(PASSKEY_SCRIPT, sandbox, "latest", "chrome://browser/content/nyx/passkeys.js", 1);
  }
}

// The page's side of passkeys: Passwords' page.js, with Browser's own channel in place of the
// extension's messages (so no wait for a content script).
const PASSKEY_SCRIPT = `(() => {
  const credentials = navigator.credentials;
  if (!credentials) return;
  const originalGet = credentials.get.bind(credentials);
  const originalCreate = credentials.create.bind(credentials);
  const b64url = (buffer) => {
    const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    return btoa(String.fromCharCode(...bytes)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  };
  const bytes = (text) => {
    const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0)).buffer;
  };
  const ask = (kind, options) => new Promise((resolve) => nyxAsk(kind, JSON.stringify(options), (answer) => resolve(JSON.parse(answer))));
  const SPKI_P256 = [0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00, 0x04];
  function spki(cose) {
    if (!cose) return null;
    const k = new Uint8Array(bytes(cose));
    if (k.length !== 77 || k[9] !== 0x20 || k[44] !== 0x20) return null;
    const out = new Uint8Array(SPKI_P256.length + 64);
    out.set(SPKI_P256);
    out.set(k.subarray(10, 42), SPKI_P256.length);
    out.set(k.subarray(45, 77), SPKI_P256.length + 32);
    return out.buffer;
  }
  function credential(kind, c) {
    const rawId = bytes(c.id);
    const clientDataJSON = bytes(c.clientDataJSON);
    const response = kind === "get"
      ? Object.setPrototypeOf({ clientDataJSON, authenticatorData: bytes(c.authenticatorData), signature: bytes(c.signature), userHandle: c.userHandle ? bytes(c.userHandle) : null }, AuthenticatorAssertionResponse.prototype)
      : Object.setPrototypeOf({
          clientDataJSON,
          attestationObject: bytes(c.attestationObject),
          getTransports: () => ["internal", "hybrid"],
          getAuthenticatorData: () => bytes(c.authenticatorData),
          getPublicKey: () => spki(c.publicKey),
          getPublicKeyAlgorithm: () => c.algorithm,
        }, AuthenticatorAttestationResponse.prototype);
    const out = {
      id: c.id, rawId, type: "public-key", authenticatorAttachment: "platform", response,
      getClientExtensionResults: () => ({}),
      toJSON: () => ({
        id: c.id, rawId: c.id, type: "public-key", authenticatorAttachment: "platform", clientExtensionResults: {},
        response: kind === "get"
          ? { clientDataJSON: c.clientDataJSON, authenticatorData: c.authenticatorData, signature: c.signature, userHandle: c.userHandle }
          : { clientDataJSON: c.clientDataJSON, attestationObject: c.attestationObject, transports: ["internal", "hybrid"], authenticatorData: c.authenticatorData, publicKeyAlgorithm: c.algorithm, publicKey: spki(c.publicKey) && b64url(spki(c.publicKey)) },
      }),
    };
    return Object.setPrototypeOf(out, PublicKeyCredential.prototype);
  }
  function plain(kind, pk) {
    const ids = (list) => (list ?? []).map((c) => ({ id: b64url(c.id), type: c.type }));
    return kind === "get"
      ? { challenge: b64url(pk.challenge), rpId: pk.rpId, allowCredentials: ids(pk.allowCredentials), userVerification: pk.userVerification }
      : { challenge: b64url(pk.challenge), rp: { id: pk.rp?.id, name: pk.rp?.name }, user: { id: b64url(pk.user.id), name: pk.user.name, displayName: pk.user.displayName },
          excludeCredentials: ids(pk.excludeCredentials), authenticatorSelection: pk.authenticatorSelection ?? {}, supportsES256: (pk.pubKeyCredParams ?? []).some((p) => p.alg === -7) };
  }
  async function handle(kind, options, original) {
    const pk = options?.publicKey;
    if (!pk || options.mediation === "conditional" || (kind === "create" && !(pk.pubKeyCredParams ?? []).some((p) => p.alg === -7))) {
      return original(options);
    }
    const answer = await ask(kind, plain(kind, pk));
    if (answer?.credential) return credential(kind, answer.credential);
    if (answer?.fallback) return original(options);
    throw new DOMException("The operation either timed out or was not allowed.", "NotAllowedError");
  }
  credentials.get = (options) => handle("get", options, originalGet);
  credentials.create = (options) => handle("create", options, originalCreate);
})();`;
