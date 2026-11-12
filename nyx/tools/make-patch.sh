#!/usr/bin/env bash
# Writes nyx/patches/<path>.patch: the change to engine/<path> on top of Firefox and Zen's
# own patches, so each Nyx patch holds only Nyx's change and applies after Zen's.
#
#   nyx/tools/make-patch.sh browser/base/content/browser.js
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
path=${1:?usage: make-patch.sh ENGINE_PATH}
engine="$root/engine"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/a/$(dirname "$path")" "$work/b/$(dirname "$path")"
if git -C "$engine" cat-file -e "HEAD:$path" 2>/dev/null; then
  git -C "$engine" show "HEAD:$path" >"$work/a/$path"
  # Zen's patches for this file, in the order surfer applies them.
  while IFS= read -r patch; do
    (cd "$work/a" && git apply "$patch")
  done < <(cd "$root/src" && rg -l --fixed-strings "+++ b/$path" -g '*.patch' | sort | sed "s#^#$root/src/#")
fi
cp "$engine/$path" "$work/b/$path"

out="$root/nyx/patches/${path//./-}.patch"
out="${out%-*}-${path##*.}.patch"
mkdir -p "$(dirname "$out")"
if [[ -f "$work/a/$path" ]]; then
  (cd "$work" && git diff --no-index --no-prefix "a/$path" "b/$path" || true) |
    sed -e "1s#.*#diff --git a/$path b/$path#" -e "s#^--- a/$path#--- a/$path#" -e "s#^+++ b/$path#+++ b/$path#" >"$out"
else
  (cd "$work" && git diff --no-index --no-prefix /dev/null "b/$path" || true) |
    sed -e "1s#.*#diff --git a/$path b/$path#" >"$out"
fi
sed -i -e 's#^--- \(a/\)\?a/#--- a/#' -e 's#^+++ \(b/\)\?b/#+++ b/#' "$out"
printf '%s\n' "${out#"$root/"}"
