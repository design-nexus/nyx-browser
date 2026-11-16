/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Which hosts are this computer or the network it's on. Only IP literals in the loopback,
// private and link-local ranges count, and the names localhost, *.localhost and *.local:
// a public name such as 10.example.com is never local, whatever it starts with.
// No imports, so the tests run it in Node too.

function ipv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) {
    return null;
  }
  const parts = m.slice(1).map(Number);
  return parts.every(n => n <= 255) ? parts : null;
}

function localIpv4([a, b]) {
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function localIpv6(host) {
  if (!/^[0-9a-f:.]+$/.test(host) || !host.includes(":")) {
    return false;
  }
  if (host === "::1") {
    return true;
  }
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1).
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  if (mapped) {
    const v4 = ipv4(mapped[1]);
    return !!v4 && localIpv4(v4);
  }
  const first = host.startsWith("::") ? 0 : parseInt(host.split(":")[0], 16);
  if (Number.isNaN(first) || first > 0xffff) {
    return false;
  }
  // fc00::/7 (unique local) and fe80::/10 (link-local).
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

export function isLocalHost(host) {
  let h = String(host ?? "").toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) {
    h = h.slice(1, -1);
  }
  h = h.replace(/%.*$/, "").replace(/\.$/, "");
  if (!h) {
    return false;
  }
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) {
    return true;
  }
  const v4 = ipv4(h);
  return v4 ? localIpv4(v4) : localIpv6(h);
}
