#!/usr/bin/env bash
# Export Community Edition tree for public GitHub (dgcpos-community).
# Usage: ./scripts/export-community.sh [output-dir]
set -euo pipefail

sed_inplace() {
  local expr="$1"
  local file="$2"
  if sed --version >/dev/null 2>&1; then
    sed -i "$expr" "$file"
  else
    sed -i.bak "$expr" "$file"
    rm -f "${file}.bak"
  fi
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/dgcpos-community}"
EXCLUDES="$ROOT/scripts/community-excludes.txt"

echo "[export-community] source=$ROOT"
echo "[export-community] output=$OUT"

rm -rf "$OUT"
mkdir -p "$OUT"

RSYNC_EXCLUDES=()
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%%#*}"
  line="${line//[[:space:]]/}"
  [[ -z "$line" ]] && continue
  RSYNC_EXCLUDES+=(--exclude "$line")
done < "$EXCLUDES"

rsync -a "${RSYNC_EXCLUDES[@]}" "$ROOT/" "$OUT/"

# Community defaults
if [[ -f "$OUT/backend/.env.example" ]]; then
  sed_inplace 's/DGCPOS_EDITION=enterprise/DGCPOS_EDITION=community/' "$OUT/backend/.env.example"
fi
if [[ -f "$OUT/frontend/.env.example" ]]; then
  sed_inplace 's/VITE_DGCPOS_EDITION=enterprise/VITE_DGCPOS_EDITION=community/' "$OUT/frontend/.env.example"
fi

# Community branding docs
cp "$ROOT/community/README.md" "$OUT/README.md"
cp "$ROOT/community/LICENSE" "$OUT/LICENSE"

# Harden — CE stubs, strip EE artifacts
"$ROOT/scripts/sanitize-community-export.sh" "$OUT"

rm -f "$OUT/LICENSE.bak"

echo "[export-community] Done — $(du -sh "$OUT" | awk '{print $1}') at $OUT"
echo "[export-community] Next: cd $OUT && git init && git add . && git commit -m 'DGCPOS Community Edition'"