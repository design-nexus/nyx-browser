#!/usr/bin/env bash
# Removes Browser for this user.
#
#   curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/nyx/uninstall.sh | bash
#
# Your profile (bookmarks, history, open tabs) stays unless you add --purge.
set -euo pipefail

APP_ID="io.github.design_nexus.nyx.Browser"
HOST="io.github.design_nexus.nyx.browser"

purge=false
for arg in "$@"; do
  case $arg in
    --purge) purge=true ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

bin="$HOME/.local/bin"
share="${XDG_DATA_HOME:-$HOME/.local/share}"
config="${XDG_CONFIG_HOME:-$HOME/.config}"

if pgrep -x nyx-browser >/dev/null || pgrep -x nyx-browser-bin >/dev/null; then
  printf 'Browser is running. Close it first.\n' >&2
  exit 1
fi

if [[ $(xdg-settings get default-web-browser 2>/dev/null) == "$APP_ID.desktop" ]]; then
  printf 'Browser is your default browser. Choose another in Settings.\n'
fi

rm -f "$bin/nyx-browser" "$bin/nyx-browser-bridge"
rm -f "$share/applications/$APP_ID.desktop" "$share/icons/hicolor/scalable/apps/$APP_ID.svg"
rm -f "$HOME/.mozilla/native-messaging-hosts/$HOST.json"
rm -f "$share/nyx/actions/$APP_ID.json" "$share/dbus-1/services/$APP_ID.service"
rm -rf "$share/nyx-browser/app" "$share/nyx-browser/runtime"

command -v update-desktop-database >/dev/null && update-desktop-database -q "$share/applications" || true

if $purge; then
  rm -rf "$share/nyx-browser" "${XDG_STATE_HOME:-$HOME/.local/state}/nyx-browser" "$config/nyx-browser" "${XDG_CACHE_HOME:-$HOME/.cache}/nyx-browser"
  printf 'Browser and its profile are removed.\n'
else
  printf 'Browser is removed. Your profile and settings stay in %s; add --purge to remove them.\n' "$config/nyx-browser"
fi
