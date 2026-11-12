# Security

## What's trusted

Web pages and anything a model writes after reading one are untrusted. So is every request
reaching the native host, since it arrived through a browser.

## Boundaries

| Boundary | How it holds | Tested by |
| --- | --- | --- |
| Page to extension | No content scripts, web-accessible resources, external messaging or host permissions. Messages not from the extension's own pages are ignored | `test_page_has_no_route_in`, `test_bundled` |
| Reading a page | `activeTab` only, so it takes a button, shortcut or menu choice on that tab. The panel asks first each time. Password field values aren't included, because only visible text is read | `test_no_read_without_a_gesture`, `test_assistant_with_a_hostile_page` |
| Page text to Assistant | Assistant's `model_generate` runs with no tools, speech, history or web access. The instructions are fixed in the host. Page text sits between markers holding a random value, checked against the text | `assistant.rs` tests, `test_assistant_with_a_hostile_page` |
| Answers to the screen | Plain text only. The extension has no `innerHTML`, `eval` or similar | `test_panel_shows_answers_as_plain_text` |
| Extension to host | Only the extension named in the host manifest, checked again by the host, and only when started by a browser | `test_bridge_refuses_strangers` |
| Host to the system | A fixed list of operations with unknown fields refused, size limits, and no shell. Capture gets fixed flags and a file the host made | `protocol.rs` tests |
| Shared files | A real file in a visible folder under home. Hidden folders and symbolic links leading elsewhere are refused | `downloads_stay_in_visible_home_folders` |
| Turning things off | Settings writes `integrations.json`, read on every request. A file that can't be read turns everything off | `permissions_fail_closed`, `test_permission_revoked` |
| Credentials | Passwords keeps its own extension, its sealed pairing and its daemon. This code never sees them | Passwords' own tests; pairing here is a check by hand |
| Security indicators | The address bar's security icon always shows, where Zen would hide it | `security_indicator` |

## Privileged code

The chrome layer in `chrome/nyx/` runs with full browser privileges, loaded by Mozilla's autoconfig
from the private install folder. It reads nothing from web pages. Whatever can write to that folder
is already running as this user.

Extension signature checks stay on. The browser's own two extensions install as built-in add-ons
from the install folder, and everything else must be signed as usual.

## Not covered

- Assistant is tested against a fake socket, and no model is run. How well a real model resists
  instructions in a page isn't measured; the boundary is that it has no tools to act with.
- Sending through the real Share Sheet, and Passwords pairing inside this runtime, are checks by hand.
- This is a review by the author and these tests, not an outside audit.
