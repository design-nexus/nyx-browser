#!/usr/bin/env bash
# Prepares engine/: Firefox's source, Zen's patches and files, then Nyx's patches.
# Run it after `npx surfer download`, after changing anything under src/ or nyx/patches/,
# and after merging a Zen release.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
mapfile -t patches < <(find nyx/patches -name '*.patch' | sort)

# Surfer re-applies each Zen patch by reversing it first, which fails on a file Nyx has
# also changed, so Nyx's patches come out first.
for ((i = ${#patches[@]} - 1; i >= 0; i--)); do
  if git -C engine apply -R --check "$root/${patches[i]}" 2>/dev/null; then
    git -C engine apply -R "$root/${patches[i]}"
  fi
done

npx surfer set brand nyx >/dev/null
npm run import
# Zen's strings live outside Firefox's tree. Without them every window's en-US bundle fails
# (Fluent needs all of a window's files), and every menu and panel label is blank.
python3 scripts/copy_language_pack.py en-US >/dev/null

for patch in "${patches[@]}"; do
  git -C engine apply "$root/$patch"
done
cp nyx/branding/firefox-branding.js engine/browser/branding/nyx/pref/firefox-branding.js
nyx/tools/vendor-ublock.sh
printf 'Applied %d Nyx patches\n' "${#patches[@]}"
