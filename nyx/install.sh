#!/usr/bin/env bash
# Installs Browser for this user.
#
#   curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/nyx/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/nyx/install.sh | bash -s -- --default
#
# From a checkout with a build in engine/, it packages and installs that build; otherwise it
# downloads the latest release and checks its SHA-256. The native host is built from source.
#
# Options:
#   --default  also make it the default web browser
set -euo pipefail

REPO="design-nexus/nyx-browser"
APP_ID="io.github.design_nexus.nyx.Browser"
HOST="io.github.design_nexus.nyx.browser"

make_default=false
for arg in "$@"; do
  case $arg in
    --default) make_default=true ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf '\033[31m==>\033[0m %s\n' "$*" >&2; exit 1; }

for tool in cargo curl tar git sha256sum; do
  command -v "$tool" >/dev/null || die "$tool is needed"
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# Run from a checkout, or piped: fetch one.
here="${BASH_SOURCE[0]:-}"
if [[ -n $here && -f "$(dirname "$here")/Cargo.toml" ]]; then
  src=$(cd "$(dirname "$here")" && pwd)
else
  say "Fetching the source"
  git clone -q --depth 1 "https://github.com/$REPO.git" "$work/src"
  src="$work/src/nyx"
fi
root=$(dirname "$src")

bin="$HOME/.local/bin"
share="${XDG_DATA_HOME:-$HOME/.local/share}"
config="${XDG_CONFIG_HOME:-$HOME/.config}"
app="$share/nyx-browser/app"

if pgrep -x nyx-browser >/dev/null || pgrep -x nyx-browser-bin >/dev/null; then
  die "Browser is running. Close it first."
fi

objdir=$(find "$root/engine" -maxdepth 1 -name 'obj-*' -type d 2>/dev/null | head -n 1 || true)
if [[ -n $objdir && -x "$objdir/dist/bin/nyx-browser" ]]; then
  say "Packaging the build in ${objdir#"$root/"}"
  (cd "$root/engine" && ./mach package >"$work/package.log" 2>&1) || die "Packaging failed; see ./mach package"
  tarball=$(find "$objdir/dist" -maxdepth 1 -name 'nyx-browser-*.tar.*' -printf '%T@ %p\n' | sort -n | tail -n 1 | cut -d' ' -f2-)
  [[ -n $tarball ]] || die "Packaging made no tarball"
else
  say "Downloading the latest release"
  release=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest")
  url=$(printf '%s' "$release" | sed -n 's/.*"browser_download_url": *"\([^"]*linux-x86_64\.tar\.xz\)".*/\1/p' | head -n 1)
  [[ -n $url ]] || die "The latest release has no Linux build"
  tarball="$work/${url##*/}"
  curl -fsSL -o "$tarball" "$url"
  curl -fsSL -o "$tarball.sha256" "$url.sha256"
  (cd "$work" && sha256sum -c --quiet "${tarball##*/}.sha256") || die "The download doesn't match its SHA-256"
fi

say "Building the native host"
cargo build --release --locked --manifest-path "$src/Cargo.toml" -p nyx-browser-bridge
target=$(cargo metadata --format-version 1 --no-deps --manifest-path "$src/Cargo.toml" | sed -n 's/.*"target_directory":"\([^"]*\)".*/\1/p')

say "Installing"
mkdir -p "$work/unpacked"
tar -xf "$tarball" -C "$work/unpacked"
unpacked=$(find "$work/unpacked" -mindepth 1 -maxdepth 1 -type d | head -n 1)
[[ -x "$unpacked/nyx-browser" ]] || die "The package has no nyx-browser"
install -m755 "$target/release/nyx-browser-bridge" "$unpacked/nyx-browser-bridge"
mkdir -p "$(dirname "$app")"
rm -rf "$app.old"
[[ -d $app ]] && mv "$app" "$app.old"
mv "$unpacked" "$app"
rm -rf "$app.old"
# A local build keeps the build ID of the last full build, so Firefox would go on running the
# scripts it cached from the previous install. This marker has it drop its caches at next start.
touch "$app/browser/.purgecaches"

mkdir -p "$bin"
ln -sfn "$app/nyx-browser" "$bin/nyx-browser"
ln -sfn "$app/nyx-browser-bridge" "$bin/nyx-browser-bridge"
install -Dm644 "$src/data/$APP_ID.svg" "$share/icons/hicolor/scalable/apps/$APP_ID.svg"
install -Dm644 "$src/data/$APP_ID.desktop" "$share/applications/$APP_ID.desktop"
sed -i "s|^Exec=nyx-browser|Exec=$bin/nyx-browser|" "$share/applications/$APP_ID.desktop"

# Browser's Nyx actions (nyx browser …, Glimpse, Assistant), served by the bridge on demand.
install -d "$share/nyx/actions" "$share/dbus-1/services"
"$app/nyx-browser-bridge" actions --describe >"$share/nyx/actions/$APP_ID.json"
sed "s|@BRIDGE@|$app/nyx-browser-bridge|" "$src/data/$APP_ID.service" >"$share/dbus-1/services/$APP_ID.service"

# Firefox-family browsers read this one folder. Only the extension named here may use the host.
hosts="$HOME/.mozilla/native-messaging-hosts"
mkdir -p "$hosts"
cat >"$hosts/$HOST.json" <<EOF
{
  "name": "$HOST",
  "description": "Browser",
  "path": "$app/nyx-browser-bridge",
  "type": "stdio",
  "allowed_extensions": ["nyx-integration@design-nexus.github.io"]
}
EOF

# The browser keeps its profiles in $XDG_CONFIG_HOME/nyx-browser. A profile from the version
# that ran a private copy of Zen is used as it is; nothing else's profile is read.
legacy="$share/nyx-browser/profile"
if [[ ! -f "$config/nyx-browser/profiles.ini" && -d $legacy ]]; then
  mkdir -p "$config/nyx-browser"
  cat >"$config/nyx-browser/profiles.ini" <<EOF
[Profile0]
Name=default
IsRelative=0
Path=$legacy
Default=1

[General]
StartWithLastProfile=1
Version=2
EOF
fi
rm -rf "$share/nyx-browser/runtime" "${XDG_STATE_HOME:-$HOME/.local/state}/nyx-browser/tokens.css"

command -v update-desktop-database >/dev/null && update-desktop-database -q "$share/applications" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$share/icons/hicolor" 2>/dev/null || true

if $make_default; then
  say "Making it the default browser"
  xdg-settings set default-web-browser "$APP_ID.desktop"
fi

say "Done. Open Browser from your launcher, or run nyx-browser."
