#!/usr/bin/env bash
# Puts the pinned Zen release in ~/.local/share/nyx-browser/runtime/<version>, checks its
# SHA-256, and installs the browser's chrome layer into that private copy. The system's
# Zen and the user's profiles aren't touched.
set -euo pipefail

src=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
field() { sed -n "s/^$1 = \"\(.*\)\"/\1/p" "$src/upstream.toml"; }
version=$(field version) url=$(field url) sha256=$(field sha256)
runtime="${XDG_DATA_HOME:-$HOME/.local/share}/nyx-browser/runtime/$version"

if [[ ! -x "$runtime/zen/zen-bin" ]]; then
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  curl -fsSL -o "$work/zen.tar.xz" "$url"
  echo "$sha256  $work/zen.tar.xz" | sha256sum -c --quiet -
  mkdir -p "$work/unpacked"
  tar -xJf "$work/zen.tar.xz" -C "$work/unpacked"
  mkdir -p "$(dirname "$runtime")"
  rm -rf "$runtime"
  mv "$work/unpacked" "$runtime"
fi

install -m 644 "$src/chrome/autoconfig/nyx-autoconfig.js" "$runtime/zen/defaults/pref/nyx-autoconfig.js"
sed "s/@TESTED_VERSION@/$version/" "$src/chrome/autoconfig/nyx.cfg" >"$runtime/zen/nyx.cfg"
rm -rf "$runtime/zen/nyx"
cp -r "$src/chrome/nyx" "$runtime/zen/nyx"

# The browser's own extensions, which chrome/nyx/addons.js installs as built-in add-ons.
rm -rf "$runtime/zen/browser/extensions"
cp -r "$src/extension" "$runtime/zen/nyx/extension"
passwords="${XDG_DATA_HOME:-$HOME/.local/share}/nyx-passwords/browser/nyx-passwords-firefox.xpi"
if [[ -f "$passwords" ]]; then
  mkdir -p "$runtime/zen/nyx/passwords"
  unzip -q -o "$passwords" -d "$runtime/zen/nyx/passwords"
fi
printf '%s\n' "$runtime/zen"
