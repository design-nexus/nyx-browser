# Updating Browser

Browser is Zen's source with Nyx's changes. Zen's releases come in on the `zen` branch, one
commit per release holding that release's tree exactly; `main` merges them like any branch.
Nothing reaches `main` on its own.

| Where | What it holds |
| --- | --- |
| `zen` | Zen's releases, one snapshot commit each (`Zen 1.24.2b (zen-browser/desktop 0057b29…)`) |
| `main` | Browser: `zen` merged, plus Nyx's changes |
| `upstream/<tag>` | A new Zen release, waiting in a pull request into `main` |

## What's Nyx's

Keep Nyx's changes in these places, so a merge touches as little as possible:

- `src/nyx/`: Browser's own chrome (modules, styles, icons, the extension).
- `nyx/`: the native host, tests, install scripts, Nyx's engine patches (`nyx/patches/`) and docs.
- `prefs/nyx/`: Nyx's defaults, which replace Zen's (`tools/ffprefs` reads them last).
- `configs/branding/nyx/`, the `nyx` brand in `surfer.json`, and `mozconfig`.
- Small edits in Zen's own files, each marked `Nyx:` in a comment: `ZenDragAndDrop.js`,
  `ZenSpace.mjs`, `ZenSpaceManager.mjs`, `ZenStartup.mjs`, `ZenVerticalTabsManager.mjs`,
  `ZenPreloadedScripts.js`, `zen-assets.jar.inc.mn` and `tools/ffprefs`.

`rg -n "Nyx:" src tools` lists the edits in Zen's files.

## A new Zen release

`nyx-upstream.yml` checks for one every six hours. When it finds one it runs
`nyx/tools/sync-zen.sh <tag> --push`, which adds the release to `zen` and points `upstream/<tag>`
at it, and opens a pull request into `main`. `nyx-release.yml` builds that pull request and runs
the smoke test. By hand:

```sh
nyx/tools/sync-zen.sh 1.24.3b --push
git switch -c merge-1.24.3b main && git merge upstream/1.24.3b
# resolve conflicts, keeping Zen's change and re-applying Nyx's
npx surfer download          # when surfer.json names a new Firefox
nyx/tools/import.sh          # Zen's patches, then Nyx's; a Nyx patch that fails needs redoing
npx surfer build
nyx/tests/smoke.py && nyx/tests/tabs.py && nyx/tests/look.py && nyx/tests/integration.py
```

Then merge the pull request, run `nyx-release.yml` with `publish` (raising `release` if this Zen
version already has a Browser release), and move nyx-packages to the new release.

A Nyx patch that no longer applies is redone against the new file: apply what's left by hand in
`engine/`, then `nyx/tools/make-patch.sh <path>` writes the patch again from Zen's version.

## A Firefox security release before Zen has one

Security fixes come first, and a visual regression never holds one back.

1. Check Mozilla's advisory for the version that fixes it.
2. On a branch from `main`, run Zen's own updater: `npm run sync` (`scripts/update_ff.py`), which
   moves `surfer.json` to the new Firefox, then `npx surfer download` and `nyx/tools/import.sh`.
   A Zen patch that fails to apply is fixed there, the smallest change that applies.
3. Build, run the smoke test and the tab tests, and publish a release. A failing look or layout
   test is written up as a known regression in the release notes, not a reason to wait.
4. When Zen's own release for that Firefox comes, merge it as above; Zen's version of any patch
   you fixed wins.

If the fix can't be built (Firefox moved too far for Zen's patches), say so in the release notes
and the nyx-packages pull request, and don't describe the installed version as patched.

## Releases

`nyx-release.yml` (run by hand with `publish`) builds Linux x86_64 on a standard GitHub runner:
Zen's release build without PGO or LTO, with sccache. It makes
`nyx-browser-<zen>-<release>.linux-x86_64.tar.xz` with the native host inside and its SHA-256,
tagged `v<zen>-<release>`. nyx-packages pins that file and its hash.

A local build can be released the same way: `./mach package`, unpack the tarball, add
`nyx/target/release/nyx-browser-bridge`, repack its top folder as `nyx-browser/` under the
name above, and `gh release create v<zen>-<release>` with the file and its `.sha256`.

To move NyxOS to a release, set `version` and `hash` in nyx-packages' `pkgs/nyx-browser.nix`
(the hash is the tarball's SHA-256 as SRI, `sha256-…`), build `.#nyx-browser` in the VM, push,
and update `nyx-packages` in nyxos' `flake.lock`.
