#!/usr/bin/env bash
# Puts uBlock Origin into engine/nyx/ublock/, where Browser installs it as a built-in extension
# (NyxAddons): the release named below, checked against its SHA-256, with Nyx's patch
# (nyx/ublock/nyx-shield.patch) for Browser's shield. import.sh runs it; it does nothing when
# that release and patch are already there.
#
# To move to a new release, set VERSION and SHA256 (sha256sum of the .firefox.signed.xpi) and
# check the patch still applies.
set -euo pipefail

VERSION=1.76.0
SHA256=6f20ff6749193599548770539103069c20948dfcd3e61c3089a67da7bfc3be39

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
patch_file="$root/nyx/ublock/nyx-shield.patch"
dest="$root/engine/nyx/ublock"
stamp="$VERSION $(sha256sum "$patch_file" | cut -d' ' -f1)"
if [[ -f $dest/.nyx-vendored && $(cat "$dest/.nyx-vendored") == "$stamp" ]]; then
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fsSL -o "$work/ublock.xpi" "https://github.com/gorhill/uBlock/releases/download/$VERSION/uBlock0_$VERSION.firefox.signed.xpi"
echo "$SHA256  $work/ublock.xpi" | sha256sum -c --quiet
rm -rf "$dest"
mkdir -p "$dest"
unzip -q "$work/ublock.xpi" -d "$dest"
# Mozilla's signature is for the release as published; Browser's built-in extensions aren't
# signed, and the patch changes it.
rm -rf "$dest/META-INF"
(cd "$dest" && patch -s -p1 <"$patch_file")
printf '%s\n' "$stamp" >"$dest/.nyx-vendored"
printf 'uBlock Origin %s in %s\n' "$VERSION" "${dest#"$root/"}"
