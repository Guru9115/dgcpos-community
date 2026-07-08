#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
#  D&G Collection RetailOS — Stop Production Web Server
# ════════════════════════════════════════════════════════════════════════════

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$APP_DIR/logs/server.pid"

echo ""
echo "  → Stopping D&G RetailOS web server..."

pkill -f "gunicorn.*app:app" 2>/dev/null
pkill -f "venv/bin/python3 app.py" 2>/dev/null

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  kill "$PID" 2>/dev/null
  rm -f "$PID_FILE"
fi

echo "  ✅  Server stopped."
echo ""
