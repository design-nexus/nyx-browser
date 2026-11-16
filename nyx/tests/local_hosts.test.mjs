// Which hosts Browser's VPN lets go direct (src/nyx/modules/NyxLocalHosts.sys.mjs).
// Run: node --test nyx/tests/local_hosts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLocalHost } from "../../src/nyx/modules/NyxLocalHosts.sys.mjs";

test("public names that start like a private address go through the VPN", () => {
  for (const host of [
    "10.attacker.com",
    "127.evil.net",
    "192.168.example.org",
    "172.16.tracker.io",
    "localhost.attacker.com",
    "169.254.example.com",
    "fc00.example.com",
    "local",
    "example.com",
    "8.8.8.8",
    "172.32.0.1",
    "172.15.0.1",
    "11.0.0.1",
    "256.0.0.1",
    "10.0.0",
    "2001:db8::1",
    "::ffff:8.8.8.8",
    "",
  ]) {
    assert.equal(isLocalHost(host), false, host);
  }
});

test("this computer and its network go direct", () => {
  for (const host of [
    "localhost",
    "LOCALHOST",
    "app.localhost",
    "printer.local",
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.20",
    "169.254.10.1",
    "::1",
    "[::1]",
    "fd12:3456::1",
    "fc00::1",
    "fe80::1",
    "fe80::1%eth0",
    "febf::1",
    "::ffff:192.168.0.1",
  ]) {
    assert.equal(isLocalHost(host), true, host);
  }
});
