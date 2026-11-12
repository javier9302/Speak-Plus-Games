#!/usr/bin/env bash
# Makes a copy of this repository with NO git history, ready to push to a new public repository.
# The history of the private repository contains old files that must never be public (fan-art
# characters were committed once and removed later), so the public repository starts clean.
#
#   tools/publish-fresh-repo.sh ../classroom-games
#
# Then: create an EMPTY public repository on GitHub (no README, no licence), and
#   cd ../classroom-games
#   git remote add origin https://github.com/<you>/<name>.git
#   git push -u origin main
#   Settings → Pages → Source: GitHub Actions   (the hub goes online at https://<you>.github.io/<name>/)
set -euo pipefail

SRC="$(git rev-parse --show-toplevel)"
DEST="${1:-}"
[ -n "$DEST" ] || { echo "Usage: tools/publish-fresh-repo.sh <new-folder>"; exit 1; }
[ ! -e "$DEST" ] || { echo "$DEST already exists. Choose a new folder."; exit 1; }
[ -z "$(git -C "$SRC" status --porcelain)" ] || { echo "Commit or stash your changes first: only committed files are copied."; exit 1; }

mkdir -p "$DEST"
# Only committed files: anything in .gitignore (fan art, saves, node_modules, .env) stays behind.
git -C "$SRC" archive --format=tar HEAD | tar -x -C "$DEST"

# Safety checks on the copy
problems=0
for f in lantern-island/public/shared/heroes-local.js .env lantern-island/.env; do
  if [ -e "$DEST/$f" ]; then echo "STOP: $f must not be published."; problems=1; fi
done
if grep -rIlE "SUPABASE_SERVICE_KEY *= *[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----" "$DEST" >/dev/null 2>&1; then
  echo "STOP: something that looks like a secret key is in the copy:"; grep -rIlE "SUPABASE_SERVICE_KEY *= *[A-Za-z0-9._-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----" "$DEST"; problems=1
fi
if [ "$problems" -ne 0 ]; then rm -rf "$DEST"; exit 1; fi
(cd "$DEST" && node tools/check.mjs >/dev/null) || { echo "STOP: node tools/check.mjs fails in the copy."; exit 1; }

cd "$DEST"
git init -q -b main
git add -A
git commit -q -m "Classroom Games: first public version"
echo "Done: $DEST has one commit and no history from the private repository."
echo "Next: create an empty public repository on GitHub, then"
echo "  cd $DEST && git remote add origin https://github.com/<you>/<name>.git && git push -u origin main"
echo "and turn on Settings → Pages → Source: GitHub Actions."
