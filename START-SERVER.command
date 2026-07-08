#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
#  D&G Collection RetailOS — Production Web Server
#  Serves the full app on http://192.168.1.63:5000
#  Any device on the same WiFi can open it in a browser
# ════════════════════════════════════════════════════════════════════════════

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
LOG_DIR="$APP_DIR/logs"
PID_FILE="$LOG_DIR/server.pid"
LOG_FILE="$LOG_DIR/server.log"
PORT=5000

mkdir -p "$LOG_DIR"

clear
echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║                                                      ║"
echo "  ║       D&G Collection RetailOS                        ║"
echo "  ║       Production Web Server                          ║"
echo "  ║                                                      ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""

# ── Kill any previous server ─────────────────────────────────────────────────
echo "  → Stopping any previous server..."
pkill -f "gunicorn.*app:app"  2>/dev/null
pkill -f "venv/bin/python3 app.py" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

# ── Build frontend (quick check — only rebuild if source is newer than dist) ─
DIST="$FRONTEND_DIR/dist/index.html"
MAIN_SRC="$FRONTEND_DIR/src/main.jsx"

NPM_BIN=""
for p in "/usr/local/bin/npm" "/opt/homebrew/bin/npm" "$(which npm 2>/dev/null)"; do
  if [ -x "$p" ]; then NPM_BIN="$p"; break; fi
done

if [ ! -f "$DIST" ] || [ "$MAIN_SRC" -nt "$DIST" ]; then
  echo "  → Building frontend (first time or source changed)..."
  cd "$FRONTEND_DIR"
  "$NPM_BIN" run build >> "$LOG_DIR/build.log" 2>&1
  if [ $? -ne 0 ]; then
    echo "  ❌  Frontend build failed! Check $LOG_DIR/build.log"
    read -p "  Press any key to exit..." -n1
    exit 1
  fi
  echo "  ✅  Frontend built!"
else
  echo "  ✅  Frontend already built (no rebuild needed)"
fi

# ── Detect local IP ──────────────────────────────────────────────────────────
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

# ── Start Gunicorn (production WSGI server) ──────────────────────────────────
echo "  → Starting web server on port $PORT..."
cd "$BACKEND_DIR"

nohup venv/bin/gunicorn \
  --workers 4 \
  --bind "0.0.0.0:$PORT" \
  --timeout 120 \
  --access-logfile "$LOG_FILE" \
  --error-logfile "$LOG_FILE" \
  --log-level info \
  "app:app" >> "$LOG_FILE" 2>&1 &

SERVER_PID=$!
echo $SERVER_PID > "$PID_FILE"

# ── Wait for server ──────────────────────────────────────────────────────────
echo "  → Waiting for server to be ready..."
for i in $(seq 1 30); do
  if curl -s "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
    echo "  ✅  Server ready!"
    break
  fi
  printf "  ."; sleep 1
done
echo ""

# ── Open browser ─────────────────────────────────────────────────────────────
sleep 0.5
open "http://$LOCAL_IP:$PORT"

echo ""
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║                                                      ║"
echo "  ║   ✅  RetailOS Web Server is RUNNING!                ║"
echo "  ║                                                      ║"
echo "  ║   🖥️   This Mac:    http://localhost:$PORT           ║"
echo "  ║   📱  On WiFi:     http://$LOCAL_IP:$PORT           ║"
echo "  ║                                                      ║"
echo "  ║   Open on any tablet/phone on the same WiFi!        ║"
echo "  ║                                                      ║"
echo "  ║   To STOP: run STOP-SERVER.command                   ║"
echo "  ║                                                      ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Logs: $LOG_FILE"
echo ""
