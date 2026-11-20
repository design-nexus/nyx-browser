// NordVPN HTTPS proxy hostname resolution (src/nyx/modules/NyxNordHost.sys.mjs).
// Run: node --test nyx/tests/vpn_nord_host.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeNordProxyHost, nordProxyHost } from "../../src/nyx/modules/NyxNordHost.sys.mjs";

test("nordProxyHost prefers proxy_ssl metadata proxy_hostname", () => {
  const server = {
    hostname: "us13418.nordvpn.com",
    technologies: [
      { identifier: "wireguard_udp", metadata: [] },
      {
        identifier: "proxy_ssl",
        metadata: [{ name: "proxy_hostname", value: "us13418.proxy.nordvpn.com" }],
      },
    ],
  };
  assert.equal(nordProxyHost(server), "us13418.proxy.nordvpn.com");
});

test("nordProxyHost falls back to .proxy.nordvpn.com when metadata is missing", () => {
  assert.equal(nordProxyHost({ hostname: "us13285.nordvpn.com" }), "us13285.proxy.nordvpn.com");
  assert.equal(nordProxyHost({ hostname: "us13285.NORDVPN.COM" }), "us13285.proxy.nordvpn.com");
});

test("normalizeNordProxyHost leaves already-normalized and custom hosts unchanged", () => {
  assert.equal(normalizeNordProxyHost("us13285.proxy.nordvpn.com"), "us13285.proxy.nordvpn.com");
  assert.equal(normalizeNordProxyHost("proxy.example.com"), "proxy.example.com");
  assert.equal(normalizeNordProxyHost(""), "");
});
