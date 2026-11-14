#!/usr/bin/env node
// A stand-in for Nyx Passwords' native messaging host, for Browser's tests: it pairs the way
// the app does (X25519, HKDF-SHA256, the same labels) and answers sealed requests from a small
// made-up vault. Each request it opens is logged to passwords-requests.log next to this file,
// with the vault's state in passwords-state.json there ({"locked": true} to lock it).

import { webcrypto as crypto } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const log = line => appendFileSync(join(here, "passwords-requests.log"), `${line}\n`);
const state = () => {
  try {
    return JSON.parse(readFileSync(join(here, "passwords-state.json"), "utf8"));
  } catch {
    return {};
  }
};
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = bytes => Buffer.from(bytes).toString("base64");
const unb64 = text => new Uint8Array(Buffer.from(text, "base64"));

const VAULT = [
  { id: "1", name: "Field Notes", username: "ken@design-nex.us", password: "hunter2-ridge", host: "127.0.0.1", has_password: true, has_totp: false, favorite: true },
  { id: "2", name: "Field Notes", username: "ken.trail", password: "old-trail-pass", host: "127.0.0.1", has_password: true, has_totp: false, favorite: false },
];

let pairing = null;

async function hello(frame) {
  const mine = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", mine.publicKey));
  const theirs = unb64(frame.pub);
  const peer = await crypto.subtle.importKey("raw", theirs, { name: "X25519" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "X25519", public: peer }, mine.privateKey, 256);
  const ikm = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const salt = new Uint8Array([...theirs, ...pub]);
  const key = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode("nixe-passwords pair v1") }, ikm, 256);
  pairing = { id: "test-pairing", key: await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]) };
  log("hello");
  return { t: "pairing", p: pairing.id, pub: b64(pub) };
}

function answer(body) {
  if (state().locked && !["status", "settings"].includes(body.r)) {
    return { error: "Locked" };
  }
  const match = () => VAULT.map(({ password, ...item }) => item);
  switch (body.r) {
    case "status":
      return { state: state().locked ? "locked" : "unlocked" };
    case "settings":
      return { fill_on_load: true, passkeys: true, icons: false, theme: null };
    case "match":
      return { items: /127\.0\.0\.1|localhost/.test(body.url) ? match() : [] };
    case "search":
      return { items: match().map(i => ({ ...i, kind: "login", sub: i.username })) };
    case "item": {
      const { password, ...item } = VAULT.find(i => i.id === body.id) ?? {};
      return { ...item, uris: ["http://127.0.0.1"], editable: true };
    }
    case "fill": {
      const item = body.id ? VAULT.find(i => i.id === body.id) : VAULT[0];
      return item ? { id: item.id, has_totp: false, username: item.username, password: item.password } : { error: "NotFound" };
    }
    case "check":
      return { state: body.password === "hunter2-ridge" ? "same" : "new" };
    case "save":
      return { saved: "created", id: "3", username: body.username };
    case "passkey.list":
      return { items: [{ id: "1", name: "Field Notes", credential_id: "Y3JlZGVudGlhbA", user_name: "ken" }], verifies: false };
    case "passkey.get":
      return { credential_id: "Y3JlZGVudGlhbA", authenticator_data: "YXV0aA", signature: "c2ln", user_handle: "a2Vu" };
    case "generate":
      return { password: "Gen-Erat3d-Pa55" };
    default:
      return {};
  }
}

async function sealed(frame) {
  if (!pairing || frame.p !== pairing.id) {
    return { t: "unknown" };
  }
  const opened = unb64(frame.c);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: opened.slice(0, 12), additionalData: enc.encode(`${frame.p}|${frame.n}`) }, pairing.key, opened.slice(12));
  const body = JSON.parse(dec.decode(plain));
  log(JSON.stringify(body));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const reply = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`${frame.p}|${frame.n}|r`) }, pairing.key, enc.encode(JSON.stringify(answer(body))));
  return { t: "msg", c: b64(new Uint8Array([...iv, ...new Uint8Array(reply)])) };
}

let buffer = Buffer.alloc(0);
let chain = Promise.resolve();
process.stdin.on("data", chunk => {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (buffer.length < 4 + length) {
      break;
    }
    const frame = JSON.parse(buffer.subarray(4, 4 + length).toString("utf8"));
    buffer = buffer.subarray(4 + length);
    chain = chain.then(async () => {
      const reply = frame.t === "hello" ? await hello(frame) : frame.t === "msg" ? await sealed(frame) : { t: "unlocked" };
      const out = Buffer.from(JSON.stringify(reply));
      const head = Buffer.alloc(4);
      head.writeUInt32LE(out.length);
      process.stdout.write(Buffer.concat([head, out]));
    });
  }
});
process.stdin.on("end", () => process.exit(0));
