#!/usr/bin/env bash
# Brings a Zen release into the repository. The zen branch gets a commit holding that release's
# tree exactly, and upstream/<tag> points at it, ready for a pull request into main. Git merges
# it like any branch; conflicts are for a person to resolve in that pull request. Nothing is
# merged into main here.
#
#   nyx/tools/sync-zen.sh 1.24.3b [--push]
set -euo pipefail

tag=${1:?usage: sync-zen.sh TAG [--push]}
push=false
[[ ${2:-} == --push ]] && push=true

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
work=$(mktemp -d)
cleanup() {
  git -C "$root" worktree remove --force "$work/vendor" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

git clone -q --depth 1 --branch "$tag" https://github.com/zen-browser/desktop.git "$work/zen"
sha=$(git -C "$work/zen" rev-parse HEAD)

git -C "$root" fetch -q origin zen
if git -C "$root" log -1 --format=%s origin/zen | grep -qF "Zen $tag ("; then
  printf 'zen already holds Zen %s\n' "$tag"
  exit 0
fi

git -C "$root" worktree add -q --detach "$work/vendor" origin/zen
cd "$work/vendor"
git rm -rq --ignore-unmatch .
rsync -a --exclude .git "$work/zen/" ./
# Zen tracks a few files its own .gitignore matches (configs/*/mozconfig).
git -C "$work/zen" ls-files -z | git add -f --pathspec-from-file=- --pathspec-file-nul
git add -A
git -c core.autocrlf=false commit -qm "Zen $tag (zen-browser/desktop $sha)"
commit=$(git rev-parse HEAD)
git -C "$root" branch -f "upstream/$tag" "$commit"
printf 'zen and upstream/%s are at %s\n' "$tag" "$commit"

if $push; then
  git push -q origin "$commit:refs/heads/zen" "$commit:refs/heads/upstream/$tag"
fi
