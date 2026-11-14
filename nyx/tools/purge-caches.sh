#!/usr/bin/env bash
# Has every profile in a profiles folder drop its startup cache at its next start, as Firefox
# does for a new version. A local build keeps the build ID of the last full build (it's compiled
# in), so without this a profile goes on running the scripts it cached from the previous install.
#
#   nyx/tools/purge-caches.sh ~/.config/nyx-browser
set -euo pipefail

dir=${1:?usage: purge-caches.sh PROFILES_FOLDER}
[[ -f "$dir/profiles.ini" ]] || exit 0
while IFS= read -r path; do
  [[ $path == /* ]] || path="$dir/$path"
  compat="$path/compatibility.ini"
  [[ -f $compat ]] || continue
  if grep -q '^InvalidateCaches=' "$compat"; then
    sed -i 's/^InvalidateCaches=.*/InvalidateCaches=1/' "$compat"
  else
    sed -i '/^\[Compatibility\]/a InvalidateCaches=1' "$compat"
  fi
done < <(sed -n 's/^Path=//p' "$dir/profiles.ini")
