#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
#  D&G Collection RetailOS — Rebuild Frontend
#  Run this after any code change, then restart with START-SERVER.command
# ════════════════════════════════════════════════════════════════════════════

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$APP_DIR/frontend"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"

NPM_BIN=""
for p in "/usr/local/bin/npm" "/opt/homebrew/bin/npm" "$(which npm 2>/dev/null)"; do
  if [ -x "$p" ]; then NPM_BIN="$p"; break; fi
done

echo ""
echo "  → Rebuilding D&G RetailOS frontend..."
cd "$FRONTEND_DIR"
"$NPM_BIN" run build

if [ $? -eq 0 ]; then
  echo ""
  echo "  ✅  Rebuild complete! Restart with START-SERVER.command"
else
  echo ""
  echo "  ❌  Build failed. Check output above."
fi
echo ""
