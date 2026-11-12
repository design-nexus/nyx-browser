# Security

## What's trusted

Web pages and anything a model writes after reading one are untrusted. So is every request
reaching the native host, since it arrived through a browser.

## Boundaries

| Boundary | How it holds | Tested by |
| --- | --- | --- |
| Page to extension | No content scripts, web-accessible resources, external messaging or host permissions. Messages not from the extension's own pages are ignored | `test_page_has_no_route_in`, `test_bundled` |
| Reading a page | `activeTab` only, so it takes a button, shortcut or menu choice on that tab. The panel asks first each time. Password field values aren't included, because only visible text is read | `test_no_read_without_a_gesture`, `test_assistant_with_a_hostile_page` |
| Page text to Assistant | A chat on Nyx AI Core with no tools, using the model Settings picked for Assistant. The instructions are fixed in the host. Page text sits between markers holding a random value, checked against the text, and is cut to 96 KiB | `assistant.rs` tests, `test_assistant_with_a_hostile_page` |
| Answers to the screen | Plain text only. The extension has no `innerHTML`, `eval` or similar | `test_panel_shows_answers_as_plain_text` |
| Extension to host | Only the extension named in the host manifest, checked again by the host, and only when started by a browser | `test_bridge_refuses_strangers` |
| Host to the system | A fixed list of operations with unknown fields refused, size limits, and no shell. Capture gets fixed flags and a file the host made | `protocol.rs` tests |
| Shared files | A real file in a visible folder under home. Hidden folders and symbolic links leading elsewhere are refused | `downloads_stay_in_visible_home_folders` |
| Turning things off | Settings writes `integrations.json`, read on every request. A file that can't be read turns everything off | `permissions_fail_closed`, `test_permission_revoked` |
| Credentials | Passwords keeps its own extension, its sealed pairing and its daemon. This code never sees them | Passwords' own tests; pairing here is a check by hand |
| Security indicators | The address bar's security icon always shows, where Zen would hide it | `security_indicator` |
| Nyx actions | `nyx-browser-bridge actions` takes only `browser.open`, `browser.search` and `browser.private`, only http and https addresses, and starts the browser with fixed arguments. Each is `external` risk, so callers confirm first; a call without confirmation is refused | `actions.rs` tests |
| The theme | `nyx-browser-bridge theme --watch` only writes CSS custom properties, one value per line, with values that could end a declaration dropped | `tokens.rs` tests |

## Privileged code

Browser's own chrome (`src/nyx/`) is built into the browser and runs with its privileges, like
Zen's and Firefox's. It reads nothing from web pages. The theme comes from a bridge process the
browser starts itself, with fixed arguments.

Extension signature checks stay on for everything else. The Nyx extension is built in, and Nyx
Passwords' extension is installed as a built-in add-on from Passwords' own install folder.

## Updates

The in-app updater is compiled out (`--disable-updater`), so nothing replaces the browser behind
its packaging's back; that's what broke the earlier version (`AUDIT.md`). Security fixes arrive
as Zen releases, or straight from Firefox when Zen is slow: see `UPDATING.md`. A Firefox security
release takes priority over any visual regression.

## Not covered

- Assistant is tested against a fake AI Core socket, and no model is run. How well a real model resists
  instructions in a page isn't measured; the boundary is that it has no tools to act with.
- Sending through the real Share Sheet, and Passwords pairing inside the browser, are checks by hand.
- This is a review by the author and these tests, not an outside audit.
