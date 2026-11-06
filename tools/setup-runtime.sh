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
install -m 644 "$src/chrome/autoconfig/nyx.cfg" "$runtime/zen/nyx.cfg"
rm -rf "$runtime/zen/nyx"
cp -r "$src/chrome/nyx" "$runtime/zen/nyx"
printf '%s\n' "$version" >"$runtime/zen/nyx/tested-version"
printf '%s\n' "$runtime/zen"
