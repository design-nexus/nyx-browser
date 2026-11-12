#!/usr/bin/env bash
# Moves to a new Zen release, keeping it only if every test passes against it:
#
#   tools/bump-upstream.sh 1.25b
#
# On a failure upstream.toml goes back to what it was, and the new runtime stays for a look.
set -euo pipefail

version=${1:?usage: tools/bump-upstream.sh VERSION}
src=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
file="$src/upstream.toml"
saved=$(cat "$file")

digest=$(gh api "repos/zen-browser/desktop/releases/tags/$version" \
  --jq '.assets[] | select(.name == "zen.linux-x86_64.tar.xz") | .digest')
sha256=${digest#sha256:}
[[ -n $sha256 ]] || { echo "Release $version has no Linux build with a digest" >&2; exit 1; }

restore() {
  printf '%s\n' "$saved" >"$file"
  "$src/tools/setup-runtime.sh" >/dev/null
  echo "Stayed on the previous release. $1" >&2
  exit 1
}

cat >"$file" <<EOF
# The Zen release this browser runs on. Raise it with tools/bump-upstream.sh, which keeps a release
# only if the tests pass against it.
version = "$version"
url = "https://github.com/zen-browser/desktop/releases/download/$version/zen.linux-x86_64.tar.xz"
sha256 = "$sha256"
EOF

"$src/tools/setup-runtime.sh" >/dev/null || restore "Setup failed."
cargo build --locked --manifest-path "$src/Cargo.toml" || restore "The build failed."
"$src/tests/tabs.py" || restore "tests/tabs.py failed."
"$src/tests/look.py" || restore "tests/look.py failed."
"$src/tests/integration.py" || restore "tests/integration.py failed."
echo "Now on $version. Commit upstream.toml."
