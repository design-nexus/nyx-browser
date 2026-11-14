/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Nyx Passwords, built into Browser. The vault stays in the Passwords app; Browser starts
// Passwords' own native messaging host (`nyx-passwords-bridge`, as Firefox would for the
// extension), pairs with the app once, and asks it for what a page needs, one sealed request at
// a time (Passwords' docs/NATIVE_MESSAGING.md). Its pages (the popup, the menu under a field, the
// save bar, the passkey card) are Passwords' own, loaded from where Passwords is installed and
// run by passwords.js with a stand-in for the extension API; filling and reading forms is
// NyxPasswordsChild, in the page's frame.
//
// Who may ask for what is decided here, from what Browser knows about each frame (its document's
// address, its tab), never from what a page says.

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Subprocess: "resource://gre/modules/Subprocess.sys.mjs",
});

const HOST = "io.github.design_nexus.nyx.passwords";
// The caller the host and the app know: the extension Browser stands in for.
const CALLER = "nyx-passwords@design-nexus.github.io";
export const PAGES = "resource://nyx-passwords/";
const enc = new TextEncoder();
const dec = new TextDecoder();

const PREFS = {
  fillOnLoad: "nyx.passwords.fill-on-load",
  inlineMenu: "nyx.passwords.inline-menu",
  copyTotp: "nyx.passwords.copy-totp",
  passkeys: "nyx.passwords.passkeys",
  passkeyAuto: "nyx.passwords.passkey-auto",
  rememberSignIn: "nyx.passwords.remember-sign-in",
  offerSave: "nyx.passwords.offer-save",
};

// ---- bytes ----

const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const b64url = bytes => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let at = 0;
  for (const p of parts) {
    out.set(new Uint8Array(p), at);
    at += p.byteLength;
  }
  return out;
};
const token = () => b64url(crypto.getRandomValues(new Uint8Array(18)));
const originOf = url => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};
const hostOf = url => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};
const isWeb = url => /^https?:/.test(url ?? "");

// ---- the host ----

/** Passwords' host, from its native messaging manifest (the user's, then the system's). */
async function findHost() {
  const dirs = [];
  for (const key of ["XREUserNativeManifests", "XRESysNativeManifests"]) {
    try {
      dirs.push(Services.dirsvc.get(key, Ci.nsIFile).path);
    } catch {}
  }
  for (const dir of dirs) {
    const manifest = PathUtils.join(dir, "native-messaging-hosts", `${HOST}.json`);
    try {
      const { path } = await IOUtils.readJSON(manifest);
      if (path && (await IOUtils.exists(path))) {
        return { command: path, manifest };
      }
    } catch {}
  }
  return null;
}

// The host answers one frame at a time, in order. Only the frame at the head of the queue is
// timed: the ones behind it wait for it.
let proc = null;
const waiting = [];
let headTimer = null;

function armHead() {
  clearTimeout(headTimer);
  if (waiting.length) {
    headTimer = setTimeout(dropHost, waiting[0].wait);
  }
}

// The host stopped, or stopped answering: everyone waiting hears so, and the process goes, as a
// late reply would answer the wrong request.
function dropHost() {
  clearTimeout(headTimer);
  const stuck = proc;
  proc = null;
  stuck?.kill();
  while (waiting.length) {
    waiting.shift().resolve({ t: "unavailable" });
  }
}

async function startHost() {
  const host = await findHost();
  if (!host) {
    return null;
  }
  const started = await lazy.Subprocess.call({
    command: host.command,
    arguments: [host.manifest, CALLER],
    stderr: "ignore",
  });
  (async () => {
    try {
      for (;;) {
        const length = await started.stdout.readUint32();
        const reply = await started.stdout.readJSON(length);
        if (proc !== started) {
          return;
        }
        waiting.shift()?.resolve(reply);
        armHead();
      }
    } catch {
      if (proc === started) {
        dropHost();
      }
    }
  })();
  return started;
}

let starting = null;
async function native(frame, wait = 15000) {
  if (!proc) {
    starting ??= startHost().finally(() => (starting = null));
    proc = await starting;
    if (!proc) {
      return { t: "unavailable" };
    }
  }
  return new Promise(resolve => {
    waiting.push({ resolve, wait });
    if (waiting.length === 1) {
      armHead();
    }
    // One write per frame, its length first: two writes could interleave with another frame's.
    const body = enc.encode(JSON.stringify(frame));
    const out = new Uint8Array(4 + body.byteLength);
    new DataView(out.buffer).setUint32(0, body.byteLength, true);
    out.set(body, 4);
    proc.stdin.write(out.buffer).catch(dropHost);
  });
}

// How long a request may take once the host has it: some wait for the server, an alias service
// or the person (Nyx Biometrics' prompt).
const SLOW = { save: 30000, add_uri: 30000, "signin.save": 30000, username: 60000, "passkey.get": 120000, "passkey.create": 120000 };

// ---- what Browser keeps: the pairing and Passwords' theme ----

const STORE = () => PathUtils.join(PathUtils.profileDir, "nyx-passwords.json");
let store = null;

async function stored() {
  if (!store) {
    try {
      store = await IOUtils.readJSON(STORE());
    } catch {
      store = {};
    }
  }
  return store;
}

async function keep(change) {
  const now = { ...(await stored()), ...change };
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) {
      delete now[key];
    }
  }
  store = now;
  await IOUtils.writeJSON(STORE(), now, { tmpPath: `${STORE()}.tmp` });
  await IOUtils.setPermissions(STORE(), 0o600).catch(() => {});
  for (const listener of storeListeners) {
    listener(change);
  }
}
const storeListeners = new Set();

// ---- pairing ----

// X25519 with the app's key; HKDF-SHA256 (salt: our key then the app's) gives the pairing key
// and the six-digit code both sides show.
async function pair() {
  const mine = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", mine.publicKey));
  const reply = await native({ t: "hello", v: 1, pub: b64(pub) });
  if (reply.t !== "pairing") {
    return { state: reply.t, error: reply.error };
  }
  const theirs = unb64(reply.pub);
  const peer = await crypto.subtle.importKey("raw", theirs, { name: "X25519" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "X25519", public: peer }, mine.privateKey, 256);
  const ikm = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const salt = concat(pub, theirs);
  const derive = (info, bits) => crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode(info) }, ikm, bits);
  // Protocol labels from before the rename; the app uses the same ones.
  const key = await derive("nixe-passwords pair v1", 256);
  const code = String(new DataView(await derive("nixe-passwords code v1", 32)).getUint32(0) % 1000000).padStart(6, "0");
  await keep({ pairing: { id: reply.p, key: b64(key) } });
  return { state: "pending", code };
}

// ---- sealed requests ----

let last = 0;

async function request(body) {
  const { pairing } = await stored();
  if (!pairing) {
    return { state: "unpaired" };
  }
  const key = await crypto.subtle.importKey("raw", unb64(pairing.key), "AES-GCM", false, ["encrypt", "decrypt"]);
  // Counters only go up, and stay near the clock: the app refuses anything else.
  const n = Math.max(Date.now(), last + 1);
  last = n;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(`${pairing.id}|${n}`) },
    key,
    enc.encode(JSON.stringify(body))
  );
  const reply = await native({ t: "msg", p: pairing.id, n, c: b64(concat(iv, sealed)) }, SLOW[body.r]);
  if (reply.t !== "msg") {
    if (reply.t === "unknown") {
      await keep({ pairing: undefined });
    }
    return { state: reply.t === "unknown" ? "unpaired" : reply.t, error: reply.error };
  }
  const opened = unb64(reply.c);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: opened.slice(0, 12), additionalData: enc.encode(`${pairing.id}|${n}|r`) },
    key,
    opened.slice(12)
  );
  return JSON.parse(dec.decode(plain));
}

/** Asks Passwords to show its unlock window; while locked only this one frame goes unsealed. */
async function showUnlock() {
  const { pairing } = await stored();
  if (!pairing) {
    return { state: "unpaired" };
  }
  const reply = await native({ t: "unlock", p: pairing.id });
  if (reply.t === "unlocked") {
    return request({ r: "unlock" });
  }
  return { state: reply.t, error: reply.error };
}

// ---- Browser's settings for Passwords ----

function prefs() {
  return Object.fromEntries(Object.entries(PREFS).map(([key, pref]) => [key, Services.prefs.getBoolPref(pref, true)]));
}

// ---- the page and its frames ----

/** A tab's page, if it's a web page: its browser and address. */
function pageOf(browser) {
  const url = browser?.currentURI?.spec;
  return browser && isWeb(url) ? { browser, url } : null;
}

function actorIn(bc) {
  try {
    return bc?.currentWindowGlobal?.getActor("NyxPasswords") ?? null;
  } catch {
    return null;
  }
}

/** Runs one of NyxPasswordsChild's queries in a frame; its answer, or null. */
async function inFrame(bc, name, args = {}) {
  const actor = actorIn(bc);
  if (!actor) {
    return null;
  }
  try {
    return await actor.sendQuery(`NyxPasswords:${name}`, args);
  } catch {
    return null;
  }
}

/** A frame's address; for a frame its page wrote itself (about:blank, srcdoc), its principal's. */
/** The window a tab is in: its Passwords pages (passwords.js). */
const uiFor = browser => browser?.browsingContext?.topChromeWindow?.NyxPasswordsUI ?? null;

const frameUrlOf = bc => {
  const global = bc?.currentWindowGlobal;
  const url = global?.documentURI?.spec ?? "";
  if (isWeb(url)) {
    return url;
  }
  const principal = global?.documentPrincipal;
  return principal?.schemeIs("https") || principal?.schemeIs("http") ? principal.spec : "";
};

/** The frame of a tab with a login form, the top one first. */
async function loginFrame(page) {
  const all = page.browser.browsingContext.getAllBrowsingContextsInSubtree();
  for (const bc of all) {
    if (await inFrame(bc, "LoginFormHere")) {
      return { bc, frameUrl: frameUrlOf(bc) };
    }
  }
  return { bc: page.browser.browsingContext, frameUrl: page.url };
}

// Per tab, by its browser id, which lasts while the tab moves between windows.
const lastFilled = new Map();
const usernameSteps = new Map();
const submits = new Map();
const providerClicks = new Map();
const pendingBars = new Map();
const FILLED_FOR = 10 * 60 * 1000;
const STEP_FOR = 10 * 60 * 1000;
const tabKey = browser => browser.browsingContext?.browserId ?? 0;

// ---- filling ----

async function fill(page, id, { bc, frameUrl, confirmed = false, trigger } = {}) {
  if (!bc) {
    ({ bc, frameUrl } = await loginFrame(page));
  }
  const frame = frameUrl ?? page.url;
  const answer = await request({ r: "fill", url: page.url, id, frame, confirmed, trigger });
  if (answer.error || answer.state) {
    return answer;
  }
  const done = await inFrame(bc, "FillLogin", { origin: originOf(frame), username: answer.username, password: answer.password, onLoad: trigger === "load" });
  if (!done) {
    return { error: "NoForm" };
  }
  lastFilled.set(tabKey(page.browser), { id: answer.id, at: Date.now() });
  if (answer.has_totp && trigger !== "load" && prefs().copyTotp) {
    request({ r: "copy", id: answer.id, field: "totp" }).catch(() => {});
  }
  return { filled: true, id: answer.id };
}

async function saveTyped(page) {
  if (!page) {
    return { error: "NoUrl" };
  }
  for (const bc of page.browser.browsingContext.getAllBrowsingContextsInSubtree()) {
    const form = await inFrame(bc, "ReadForm");
    if (form?.password) {
      return request({ r: "save", url: frameUrlOf(bc), page: page.url, username: form.username, password: form.password });
    }
  }
  return { error: "NoPassword" };
}

// ---- the menu, the bar and the passkey card ----

// Each is opened for one frame of one tab, under a random token; it may act only for that frame,
// and only while the token lives.
const opened = new Map();

function open(kind, data) {
  const t = token();
  opened.set(t, { kind, at: Date.now(), ...data });
  setTimeout(() => opened.delete(t), 10 * 60 * 1000);
  return t;
}

async function menuItems(entry) {
  const page = pageOf(entry.browser);
  if (!page) {
    return { state: "gone" };
  }
  const status = await request({ r: "status" });
  if (status.state !== "unlocked") {
    return { state: status.state ?? "unknown" };
  }
  if (entry.field === "card" || entry.field === "identity") {
    const found = await request({ r: entry.field === "card" ? "cards" : "identities", url: page.url });
    return { state: "unlocked", field: entry.field, items: found.items ?? [] };
  }
  const found = await request({ r: "match", url: page.url });
  const notified = entry.field === "otp" ? await request({ r: "otp.match", url: page.url, frame: entry.frameUrl }).catch(() => ({})) : {};
  return { state: "unlocked", field: entry.field, host: hostOf(page.url), items: found.items ?? [], notified: notified.items ?? [] };
}

async function menuAct(entry, message) {
  const page = pageOf(entry.browser);
  if (!page) {
    return { error: "NoUrl" };
  }
  const bc = BrowsingContext.get(entry.bcId);
  if (!bc || frameUrlOf(bc) !== entry.frameUrl) {
    return { error: "NoForm" };
  }
  const origin = originOf(entry.frameUrl);
  switch (message.cmd) {
    case "menu.fill":
      return fill(page, message.id, { bc, frameUrl: entry.frameUrl });
    case "menu.code": {
      const answer = await request({ r: "totp", url: page.url, id: message.id, frame: entry.frameUrl });
      return answer.code ? { filled: await inFrame(bc, "FillCode", { origin, code: answer.code }) } : answer;
    }
    case "menu.notified": {
      const answer = await request({ r: "otp.take", url: page.url, id: message.id, frame: entry.frameUrl, confirmed: message.confirmed === true });
      return answer.code ? { filled: await inFrame(bc, "FillCode", { origin, code: answer.code }) } : answer;
    }
    case "menu.form": {
      const answer = await request({ r: entry.field === "card" ? "fill_card" : "fill_identity", url: page.url, id: message.id, frame: entry.frameUrl });
      return answer.error ? answer : { filled: await inFrame(bc, "FillForm", { origin, kind: entry.field, values: answer }) };
    }
    case "menu.generate": {
      const answer = await request({ r: "generate" });
      return answer.password ? { filled: await inFrame(bc, "FillNew", { origin, password: answer.password }) } : answer;
    }
    case "menu.signin":
      return { clicked: await inFrame(bc, "ClickProvider", { origin, provider: message.provider }) };
    case "menu.unlock":
      return showUnlock();
    default:
      return { error: "unknown" };
  }
}

const nearSite = (a, b) => {
  try {
    const tail = u => new URL(u).hostname.split(".").slice(-2).join(".");
    return tail(a) === tail(b);
  } catch {
    return false;
  }
};

async function offerSave(page, frameUrl, form) {
  if (!form.password || !prefs().offerSave) {
    return;
  }
  const key = tabKey(page.browser);
  const signature = `${frameUrl}\n${form.username}\n${form.password}`;
  const at = Date.now();
  if (submits.get(key)?.signature === signature) {
    return;
  }
  submits.set(key, { signature, at });
  setTimeout(() => submits.get(key)?.at === at && submits.delete(key), 5000);
  let username = form.username;
  const step = usernameSteps.get(key);
  if (!username && step && at - step.at < STEP_FOR && nearSite(step.url, frameUrl)) {
    username = step.username;
  }
  const filled = lastFilled.get(key);
  const answer = await request({
    r: "check",
    url: frameUrl,
    page: page.url,
    username,
    password: form.password,
    current: form.current,
    change: form.change,
    filled: filled && at - filled.at < FILLED_FOR ? filled.id : null,
  });
  if (answer.state !== "new" && answer.state !== "changed") {
    return;
  }
  const t = open("bar", {
    browser: page.browser,
    frameUrl,
    page: page.url,
    id: answer.id ?? null,
    username,
    password: form.password,
    question: answer.state,
    change: form.change,
    host: hostOf(frameUrl),
  });
  setTimeout(() => {
    const e = opened.get(t);
    if (e) {
      e.password = "";
    }
  }, 2 * 60 * 1000);
  pendingBars.set(key, t);
  setTimeout(() => settleBar(page.browser, t), 2500);
}

// The bar waits for the page to move on from the sign-in: a password field still showing then
// means it failed, or the form wasn't one. A change-password form often stays on its page.
async function settleBar(browser, t) {
  const entry = opened.get(t);
  const key = tabKey(browser);
  if (pendingBars.get(key) !== t || !entry || browser.browsingContext?.webProgress?.isLoadingDocument) {
    return;
  }
  pendingBars.delete(key);
  if (!entry.change) {
    for (const bc of browser.browsingContext.getAllBrowsingContextsInSubtree()) {
      if (await inFrame(bc, "PasswordFieldShown")) {
        opened.delete(t);
        return;
      }
    }
  }
  showBar(browser, t);
}

function showBar(browser, t) {
  uiFor(browser)?.showBar(browser, t);
}

async function barAnswer(entry, choice) {
  switch (choice) {
    case "save":
      return request({ r: "save", url: entry.frameUrl, page: entry.page, id: entry.id, username: entry.username, password: entry.password });
    case "never":
      return request({ r: "exclude", url: entry.frameUrl });
    case "remember":
      return request({ r: "signin.save", url: entry.frameUrl, provider: entry.provider, username: "" });
    default:
      return {};
  }
}

async function backFromProvider(browser, url) {
  const click = providerClicks.get(tabKey(browser));
  if (!click || Date.now() - click.at > 5 * 60 * 1000 || originOf(url) !== click.origin) {
    return;
  }
  providerClicks.delete(tabKey(browser));
  if (!prefs().rememberSignIn) {
    return;
  }
  const found = await request({ r: "match", url });
  if ((found.items ?? []).some(i => i.sign_in_with === click.provider)) {
    return;
  }
  const t = open("bar", { browser, frameUrl: url, question: "provider", provider: click.provider, host: hostOf(url) });
  showBar(browser, t);
}

// ---- passkeys ----

// The page asked for a passkey (NyxPasswordsChild answers navigator.credentials for it). The
// client data is built here, from the frame's origin as Browser knows it; the person picks or
// confirms on the card; the app signs. With one passkey to use there's nothing to pick: Nyx
// Biometrics' prompt confirms it where the site asks for that, else the card counts down.
const PASSKEY_WAIT = 3 * 60 * 1000;

async function passkey(kind, options, { browser, bc, frameUrl }) {
  const settings = await request({ r: "settings" });
  if (!settings.passkeys || !prefs().passkeys) {
    return { fallback: true };
  }
  const origin = originOf(frameUrl);
  const page = new URL(frameUrl);
  const rpId = (kind === "create" ? options.rp?.id : options.rpId) ?? page.hostname;
  const clientData = JSON.stringify({
    type: kind === "create" ? "webauthn.create" : "webauthn.get",
    challenge: options.challenge,
    origin,
    crossOrigin: bc !== bc.top,
  });
  const hash = b64url(await crypto.subtle.digest("SHA-256", enc.encode(clientData)));
  const uv = options.userVerification ?? "preferred";
  let choices = [];
  let verifies = false;
  if (kind === "get") {
    const found = await request({ r: "passkey.list", url: frameUrl, rp_id: rpId, uv, allow: (options.allowCredentials ?? []).map(c => c.id) });
    if (found.error || found.state) {
      return { fallback: true };
    }
    choices = found.items ?? [];
    if (!choices.length) {
      return { fallback: true };
    }
    verifies = found.verifies === true;
  } else {
    const found = await request({ r: "match", url: frameUrl });
    if (found.state) {
      return { fallback: true };
    }
    choices = (found.items ?? []).map(i => ({ id: i.id, name: i.name, user_name: i.username }));
  }
  const one = kind === "get" && choices.length === 1;
  const card = { ask: kind, host: page.host, rpId, user: options.user?.name ?? "", choices };
  const choice = one && verifies ? { index: 0 } : await confirmCard(browser, { ...card, auto: one && prefs().passkeyAuto });
  if (!choice) {
    return { fallback: choice === null };
  }
  if (kind === "get") {
    const picked = choices[choice.index];
    if (!picked) {
      return { error: "NotFound" };
    }
    const a = await request({ r: "passkey.get", url: frameUrl, rp_id: rpId, id: picked.id, credential_id: picked.credential_id, client_data_hash: hash, uv, confirmed: true });
    if (a.error) {
      return { error: a.error };
    }
    return { credential: { id: a.credential_id, clientDataJSON: b64url(enc.encode(clientData)), authenticatorData: a.authenticator_data, signature: a.signature, userHandle: a.user_handle } };
  }
  const made = await request({
    r: "passkey.create",
    url: frameUrl,
    rp_id: rpId,
    rp_name: options.rp?.name ?? rpId,
    user_id: options.user?.id,
    user_name: options.user?.name ?? "",
    user_display_name: options.user?.displayName ?? "",
    client_data_hash: hash,
    exclude: (options.excludeCredentials ?? []).map(c => c.id),
    rk: options.authenticatorSelection?.residentKey !== "discouraged",
    uv: options.authenticatorSelection?.userVerification ?? "preferred",
    into: choice.into ?? null,
    confirmed: true,
  });
  if (made.error) {
    return { error: made.error };
  }
  return {
    credential: {
      id: made.credential_id,
      clientDataJSON: b64url(enc.encode(clientData)),
      attestationObject: made.attestation_object,
      authenticatorData: made.authenticator_data,
      publicKey: made.public_key,
      algorithm: made.algorithm,
    },
  };
}

/** The person's choice on the passkey card: `null` is "use a security key instead", `false` no. */
function confirmCard(browser, data) {
  return new Promise(resolve => {
    const t = open("passkey", { browser, ...data, resolve });
    setTimeout(() => answerPasskey(t, false), PASSKEY_WAIT);
    const ui = uiFor(browser);
    if (!ui?.showPasskey(browser, t)) {
      answerPasskey(t, false);
    }
  });
}

function answerPasskey(t, choice) {
  const e = opened.get(t);
  if (!e?.resolve) {
    return;
  }
  opened.delete(t);
  e.resolve(choice);
}

// ---- the theme Passwords reports, for its pages ----

async function refreshTheme() {
  const s = await request({ r: "settings" }).catch(() => ({}));
  if (s.theme) {
    await keep({ theme: s.theme, icons: Boolean(s.icons) });
  }
  return s;
}

// ---- what the pages ask ----

/** The popup: anything about the vault, for the tab in front of its window. */
async function fromPopup(message, window) {
  const page = pageOf(window.gBrowser.selectedBrowser);
  switch (message.cmd) {
    case "status": {
      const { pairing } = await stored();
      if (!pairing) {
        return { state: "unpaired" };
      }
      const status = await request({ r: "status" });
      if (status.state) {
        refreshTheme();
      }
      return status.state ? status : { state: "unknown" };
    }
    case "pair":
      return pair();
    case "unpair":
      await request({ r: "unpair" }).catch(() => {});
      await keep({ pairing: undefined });
      return { state: "unpaired" };
    case "match": {
      if (!page) {
        return { items: [], host: "" };
      }
      const answer = await request({ r: "match", url: page.url });
      return { ...answer, host: hostOf(page.url) };
    }
    case "search":
      return request({ r: "search", q: message.q ?? "" });
    case "item":
      return request({ r: "item", id: message.id });
    case "security":
      return request({ r: "security", ids: message.ids ?? [] });
    case "fill":
      return page ? fill(page, message.id, { confirmed: Boolean(message.confirmed) }) : { error: "NoUrl" };
    case "add_uri":
      return page ? request({ r: "add_uri", url: page.url, id: message.id }) : { error: "NoUrl" };
    case "copy":
      return request({ r: "copy", id: message.id, field: message.field });
    case "totp":
      return page ? request({ r: "totp", url: page.url, id: message.id }) : { error: "NoUrl" };
    case "generate":
      return request({ r: "generate", rules: message.rules });
    case "username":
      return request({ r: "username", url: page?.url ?? "" });
    case "unlock":
      return showUnlock();
    case "open":
      return request({ r: "open", id: message.id });
    case "save":
      return saveTyped(page);
    case "settings":
      return { ...prefs(), app: await refreshTheme() };
    case "lock":
      return request({ r: "lock" });
    case "fill_generated": {
      const value = String(message.value ?? "");
      if (!page || !value || value.length > 256) {
        return { error: "NoForm" };
      }
      const { bc, frameUrl } = await loginFrame(page);
      const username = message.kind === "username";
      const filled = await inFrame(bc, username ? "FillUsername" : "FillNew", { origin: originOf(frameUrl), value, password: value });
      return filled ? { filled } : { error: username ? "NoUsernameField" : "NoForm" };
    }
    case "signin":
      return page ? { clicked: await inFrame(page.browser.browsingContext, "ClickProvider", { origin: originOf(page.url), provider: String(message.provider ?? "") }) } : { error: "NoUrl" };
    case "fill_item": {
      if (!page) {
        return { error: "NoUrl" };
      }
      const kind = message.kind === "card" ? "card" : "identity";
      const answer = await request({ r: kind === "card" ? "fill_card" : "fill_identity", url: page.url, id: message.id, frame: page.url });
      if (answer.error) {
        return answer;
      }
      const filled = await inFrame(page.browser.browsingContext, "FillForm", { origin: originOf(page.url), kind, values: answer });
      return filled ? { filled } : { error: "NoForm" };
    }
    case "set": {
      const pref = PREFS[message.key];
      if (pref) {
        Services.prefs.setBoolPref(pref, Boolean(message.value));
      }
      return prefs();
    }
    default:
      return { error: "unknown" };
  }
}

export const NyxPasswords = {
  PAGES,

  /** A message from one of Passwords' pages, as passwords.js hands it: which page, and its message. */
  async fromPage(page, message, window) {
    const cmd = String(message?.cmd ?? "");
    if (page === "menu" && cmd.startsWith("menu.")) {
      const entry = opened.get(message.token);
      if (entry?.kind !== "menu") {
        return null;
      }
      return cmd === "menu.items" ? menuItems(entry) : menuAct(entry, message);
    }
    if (page === "bar" && cmd.startsWith("bar.")) {
      const entry = opened.get(message.token);
      if (entry?.kind !== "bar") {
        return null;
      }
      if (cmd === "bar.state") {
        return { question: entry.question, host: entry.host, username: entry.username, provider: entry.provider };
      }
      opened.delete(message.token);
      return barAnswer(entry, message.choice);
    }
    if (page === "passkey" && cmd.startsWith("passkey.")) {
      const entry = opened.get(message.token);
      if (entry?.kind !== "passkey") {
        return null;
      }
      if (cmd === "passkey.state") {
        return { ask: entry.ask, host: entry.host, rpId: entry.rpId, user: entry.user, choices: entry.choices, auto: entry.auto, inWindow: false };
      }
      answerPasskey(message.token, message.choice === undefined ? false : message.choice);
      return {};
    }
    if (cmd === "icon") {
      return request({ r: "icon", host: String(message.host ?? "") });
    }
    if (page === "popup") {
      return fromPopup(message, window);
    }
    return null;
  },

  /** From NyxPasswordsChild, about the frame it runs in (Browser says which, and its address). */
  async fromFrame(name, data, { browser, bc, frameUrl }) {
    const page = pageOf(browser);
    if (!page || !isWeb(frameUrl)) {
      return null;
    }
    const { pairing } = await stored();
    switch (name) {
      case "NyxPasswords:Field": {
        if (!pairing || (!prefs().inlineMenu && !data.asked)) {
          return null;
        }
        const field = ["login", "new-password", "otp", "card", "identity"].includes(data.field) ? data.field : "login";
        // Under a login field on a site with nothing saved, the menu waits to be asked for (the
        // key in the field), so every email box doesn't say "No logins".
        if (field === "login" && !data.asked) {
          const found = await request({ r: "match", url: page.url }).catch(() => ({}));
          if (Array.isArray(found.items) && !found.items.length) {
            return null;
          }
        }
        const t = open("menu", { browser, bcId: bc.id, frameUrl, field });
        uiFor(browser)?.showMenu(browser, t, data.rect);
        return { token: t };
      }
      case "NyxPasswords:Blur":
        uiFor(browser)?.fieldLeft(browser);
        return null;
      case "NyxPasswords:Loaded":
        return pairing && prefs().fillOnLoad ? fill(page, null, { bc, frameUrl, trigger: "load" }) : null;
      case "NyxPasswords:Submitted":
        if (pairing) {
          offerSave(page, frameUrl, {
            username: String(data.username ?? "").slice(0, 512),
            password: String(data.password ?? "").slice(0, 1024),
            current: String(data.current ?? "").slice(0, 1024),
            change: data.change === true,
          });
        }
        return null;
      case "NyxPasswords:UsernameStep":
        if (data.username) {
          usernameSteps.set(tabKey(browser), { username: String(data.username).slice(0, 512), url: frameUrl, at: Date.now() });
        }
        return null;
      case "NyxPasswords:Provider":
        providerClicks.set(tabKey(browser), { provider: String(data.provider), origin: originOf(page.url), at: Date.now() });
        return null;
      case "NyxPasswords:Passkey":
        if (!pairing || !prefs().passkeys) {
          return { fallback: true };
        }
        return passkey(data.kind === "create" ? "create" : "get", data.options ?? {}, { browser, bc, frameUrl });
      default:
        return null;
    }
  },

  /** A tab finished loading: the bar that waited for it, and the way back from a "Sign in with". */
  loaded(browser) {
    const url = browser.currentURI?.spec;
    if (!isWeb(url)) {
      return;
    }
    backFromProvider(browser, url);
    const t = pendingBars.get(tabKey(browser));
    if (t) {
      settleBar(browser, t);
    }
  },

  forgetTab(browser) {
    const key = tabKey(browser);
    for (const map of [lastFilled, usernameSteps, submits, providerClicks, pendingBars]) {
      map.delete(key);
    }
    for (const [t, e] of opened) {
      if (e.browser === browser) {
        if (e.kind === "passkey") {
          answerPasskey(t, false);
        }
        opened.delete(t);
      }
    }
  },

  /** The shortcut: the page's login, the next one when pressed again soon. */
  async fillShortcut(window) {
    const page = pageOf(window.gBrowser.selectedBrowser);
    if (!page) {
      return false;
    }
    const found = await request({ r: "match", url: page.url });
    const items = (found.items ?? []).filter(i => i.has_password || i.username);
    if (!items.length) {
      return false;
    }
    const key = tabKey(page.browser);
    const cycle = this._cycle?.key === key && Date.now() - this._cycle.at < 10000 ? { key, index: this._cycle.index + 1 } : { key, index: 0 };
    this._cycle = { ...cycle, at: Date.now() };
    await fill(page, items[cycle.index % items.length].id);
    return true;
  },

  async generateInto(window) {
    const page = pageOf(window.gBrowser.selectedBrowser);
    const answer = await request({ r: "generate" });
    if (!page || !answer.password) {
      return;
    }
    const { bc, frameUrl } = await loginFrame(page);
    await inFrame(bc, "FillNew", { origin: originOf(frameUrl), password: answer.password });
  },

  // For the pages' stand-in API (storage.local and its changes).
  stored,
  onStoreChange(listener) {
    storeListeners.add(listener);
    return () => storeListeners.delete(listener);
  },

  // For Settings.
  status: () => request({ r: "status" }),
  lock: () => request({ r: "lock" }),
  unlock: showUnlock,
  paired: async () => !!(await stored()).pairing,

  /** Firefox's own saved logins, into Passwords; each is removed from the profile once saved. */
  async importFirefoxLogins() {
    const logins = await Services.logins.getAllLogins();
    let moved = 0;
    for (const login of logins) {
      if (!isWeb(login.origin)) {
        continue;
      }
      const answer = await request({ r: "save", url: login.origin, page: login.origin, username: login.username, password: login.password });
      if (answer.saved) {
        await Services.logins.removeLoginAsync(login);
        moved++;
      }
    }
    return { moved, left: logins.length - moved };
  },
};
