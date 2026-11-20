/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// NordVPN's HTTPS proxy on port 89 presents a *.proxy.nordvpn.com TLS certificate,
// not *.nordvpn.com, so connections must use the proxy_hostname from proxy_ssl metadata.

/**
 * Normalizes a NordVPN server hostname to its *.proxy.nordvpn.com TLS proxy hostname.
 */
export function normalizeNordProxyHost(hostname) {
  if (!hostname) {
    return hostname;
  }
  const lower = hostname.toLowerCase();
  if (lower.endsWith(".nordvpn.com") && !lower.endsWith(".proxy.nordvpn.com")) {
    return `${hostname.slice(0, -".nordvpn.com".length)}.proxy.nordvpn.com`;
  }
  return hostname;
}

/**
 * Extracts the HTTPS proxy hostname from a NordVPN /servers/recommendations entry.
 */
export function nordProxyHost(server) {
  const tech = server?.technologies?.find(t => t.identifier === "proxy_ssl");
  const meta = tech?.metadata?.find(m => m.name === "proxy_hostname")?.value;
  return meta || normalizeNordProxyHost(server?.hostname);
}
