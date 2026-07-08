#!/bin/bash
# ════════════════════════════════════════════════════════
#  D&G Collection RetailOS — Startup Script
# ════════════════════════════════════════════════════════

# Load full user PATH (Homebrew, nvm, etc.)
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"

clear
echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║                                              ║"
echo "  ║       D&G Collection RetailOS                ║"
echo "  ║       Starting system...                     ║"
echo "  ║                                              ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# ── Kill any old instances ────────────────────────────
echo "  → Stopping any previous instances..."
pkill -f "venv/bin/python3 app.py" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

# ── Start Backend ─────────────────────────────────────
echo "  → Starting backend (Flask API)..."
cd "$BACKEND_DIR"
nohup venv/bin/python3 app.py >> "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$LOG_DIR/backend.pid"

# ── Wait for backend ──────────────────────────────────
echo "  → Waiting for backend to be ready..."
for i in $(seq 1 25); do
  if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
    echo "  ✅  Backend ready!"
    break
  fi
  printf "  ."; sleep 1
done
echo ""

# ── Start Frontend ────────────────────────────────────
echo "  → Starting frontend (Vite dev server)..."
cd "$FRONTEND_DIR"

# Find npm — try common locations
NPM_BIN=""
for p in "/opt/homebrew/bin/npm" "/usr/local/bin/npm" "$(which npm 2>/dev/null)"; do
  if [ -x "$p" ]; then NPM_BIN="$p"; break; fi
done

if [ -z "$NPM_BIN" ]; then
  echo "  ❌  npm not found. Please install Node.js."
  read -p "  Press any key to exit..." -n1
  exit 1
fi

nohup "$NPM_BIN" run dev >> "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$LOG_DIR/frontend.pid"

# ── Wait for frontend ─────────────────────────────────
echo "  → Waiting for frontend to be ready..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo "  ✅  Frontend ready!"
    break
  fi
  printf "  ."; sleep 1
done
echo ""

# ── Open browser ──────────────────────────────────────
echo "  → Opening RetailOS in browser..."
sleep 1
open "http://localhost:5173"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║                                              ║"
echo "  ║   ✅  RetailOS is RUNNING!                   ║"
echo "  ║                                              ║"
echo "  ║   🌐  http://localhost:5173                  ║"
echo "  ║                                              ║"
echo "  ║   To STOP: run STOP.command                  ║"
echo "  ║                                              ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""
echo "  This window can be closed safely."
echo "  The system will keep running in the background."
echo ""
