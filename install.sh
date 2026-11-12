#!/usr/bin/env bash
# Installs Browser for this user: see nyx/install.sh.
#
#   curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/install.sh | bash
set -euo pipefail

args=()
for arg in "$@"; do
  [[ $arg == browser ]] || args+=("$arg")
done
here="${BASH_SOURCE[0]:-}"
if [[ -n $here && -f "$(dirname "$here")/nyx/install.sh" ]]; then
  exec "$(dirname "$here")/nyx/install.sh" "${args[@]}"
fi
curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/nyx/install.sh | bash -s -- "${args[@]}"
