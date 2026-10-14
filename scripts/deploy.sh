#!/usr/bin/env bash
# dist/ をビルドして gh-pages ブランチに公開する（GitHub Pages 用）
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
npm test
REMOTE=$(git remote get-url origin)
TMP=$(mktemp -d)
cp -r dist/. "$TMP"
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" commit -q -m "Deploy $(date '+%Y-%m-%d %H:%M')"
git push -f -q "$REMOTE" gh-pages
cd - >/dev/null
rm -rf "$TMP"
echo "公開しました"
