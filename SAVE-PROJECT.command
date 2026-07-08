#!/bin/bash
# Save DGC RetailOS — git commit + Documents backup zip
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== DGC RetailOS — Save Project ==="
echo "Location: $ROOT"
echo ""

# Git save (if repo)
if [ -d .git ]; then
  if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain)" ]; then
    echo "Committing changes..."
    git add -A
    git reset HEAD -- '*.pyc' '**/__pycache__/**' 'backend/retailos.db' 'backend/backups/' '.DS_Store' 'frontend/dist/' 'frontend/node_modules/' 'marketing/node_modules/' 2>/dev/null || true
    VER=$(grep -m1 '"version"' frontend/package.json | sed 's/.*"\([0-9.]*\)".*/\1/')
    git commit -m "Save project snapshot v${VER} — $(date '+%Y-%m-%d %H:%M')" || echo "(nothing new to commit)"
  else
    echo "Git: already clean — no new commit needed"
  fi
  echo "Latest commit: $(git log -1 --oneline)"
fi

VER=$(grep -m1 '"version"' frontend/package.json | sed 's/.*"\([0-9.]*\)".*/\1/')
BACKUP="$HOME/Documents/DGC-RetailOS-v${VER}-backup-$(date +%Y%m%d-%H%M).zip"
PARENT="$(dirname "$ROOT")"
NAME="$(basename "$ROOT")"

echo ""
echo "Creating backup zip..."
cd "$PARENT"
zip -rq "$BACKUP" "$NAME" \
  -x "$NAME/frontend/node_modules/*" \
  -x "$NAME/frontend/dist/*" \
  -x "$NAME/marketing/node_modules/*" \
  -x "$NAME/marketing/.next/*" \
  -x "$NAME/backend/venv/*" \
  -x "$NAME/backend/.venv/*" \
  -x "$NAME/**/__pycache__/*" \
  -x "$NAME/**/*.pyc"

echo ""
echo "Saved:"
echo "  Source:  $ROOT"
echo "  Git:     $(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo 'n/a')"
echo "  Backup:  $BACKUP"
ls -lh "$BACKUP"
echo ""
echo "Done."
read -n 1 -s -r -p "Press any key to close..."