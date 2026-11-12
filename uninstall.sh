#!/usr/bin/env bash
# Removes Browser for this user: see nyx/uninstall.sh.
#
#   curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/uninstall.sh | bash
set -euo pipefail

here="${BASH_SOURCE[0]:-}"
if [[ -n $here && -f "$(dirname "$here")/nyx/uninstall.sh" ]]; then
  exec "$(dirname "$here")/nyx/uninstall.sh" "$@"
fi
curl -fsSL https://raw.githubusercontent.com/design-nexus/nyx-browser/main/nyx/uninstall.sh | bash -s -- "$@"
