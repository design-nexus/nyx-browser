#!/usr/bin/env bash
# Installs Browser for this user.
#
#   curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/install.sh | bash -s -- --default
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

for tool in cargo curl tar unzip git; do
  command -v "$tool" >/dev/null || die "$tool is needed"
done

# Run from a checkout, or piped: fetch one.
here="${BASH_SOURCE[0]:-}"
if [[ -n $here && -f "$(dirname "$here")/Cargo.toml" ]]; then
  src=$(cd "$(dirname "$here")" && pwd)
else
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  say "Fetching the source"
  git clone -q --depth 1 "https://github.com/$REPO.git" "$work/src"
  src="$work/src"
fi

bin="$HOME/.local/bin"
share="${XDG_DATA_HOME:-$HOME/.local/share}"

say "Building"
cargo build --release --locked --manifest-path "$src/Cargo.toml" -p nyx-browser -p nyx-browser-bridge
target=$(cargo metadata --format-version 1 --no-deps --manifest-path "$src/Cargo.toml" | sed -n 's/.*"target_directory":"\([^"]*\)".*/\1/p')

say "Setting up the browser runtime"
"$src/tools/setup-runtime.sh" >/dev/null

say "Installing"
install -Dm755 "$target/release/nyx-browser" "$bin/nyx-browser"
install -Dm755 "$target/release/nyx-browser-bridge" "$bin/nyx-browser-bridge"
install -Dm644 "$src/data/$APP_ID.svg" "$share/icons/hicolor/scalable/apps/$APP_ID.svg"
install -Dm644 "$src/data/$APP_ID.desktop" "$share/applications/$APP_ID.desktop"
sed -i "s|^Exec=nyx-browser|Exec=$bin/nyx-browser|" "$share/applications/$APP_ID.desktop"

# Firefox-family browsers read this one folder. Only the extension named here may use the host.
hosts="$HOME/.mozilla/native-messaging-hosts"
mkdir -p "$hosts"
cat >"$hosts/$HOST.json" <<EOF
{
  "name": "$HOST",
  "description": "Browser",
  "path": "$bin/nyx-browser-bridge",
  "type": "stdio",
  "allowed_extensions": ["nyx-integration@design-nexus.github.io"]
}
EOF

command -v update-desktop-database >/dev/null && update-desktop-database -q "$share/applications" || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q -t "$share/icons/hicolor" 2>/dev/null || true

if $make_default; then
  say "Making it the default browser"
  xdg-settings set default-web-browser "$APP_ID.desktop"
fi

say "Done. Open Browser from your launcher, or run nyx-browser."
