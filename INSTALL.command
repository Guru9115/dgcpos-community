#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
#  D&G Collection RetailOS — First-Time Setup
#  Run this ONCE after cloning from GitHub.
#  After setup completes, use START-SERVER.command every day.
# ════════════════════════════════════════════════════════════════════════════

export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
source ~/.zshrc 2>/dev/null || source ~/.bash_profile 2>/dev/null || true

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$LOG_DIR"

clear
echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║                                                          ║"
echo "  ║       D&G Collection RetailOS                            ║"
echo "  ║       First-Time Setup                                   ║"
echo "  ║                                                          ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  This will install all dependencies and prepare the app."
echo "  Takes about 2-3 minutes. Please wait..."
echo ""

ERRORS=0

# ════════════════════════════════════════════════════════════════════════════
# 1. CHECK PYTHON 3
# ════════════════════════════════════════════════════════════════════════════
echo "  [1/6] Checking Python 3..."
PYTHON=""
for p in "python3.12" "python3.11" "python3.10" "python3" "/opt/homebrew/bin/python3" "/usr/local/bin/python3"; do
  if command -v "$p" &>/dev/null; then
    VER=$("$p" --version 2>&1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    MAJOR=$(echo $VER | cut -d. -f1)
    MINOR=$(echo $VER | cut -d. -f2)
    if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 9 ]; then
      PYTHON="$p"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  echo "  ❌  Python 3.9+ not found."
  echo ""
  echo "  Please install Python from: https://www.python.org/downloads/"
  echo "  Then run this setup again."
  echo ""
  read -p "  Press any key to exit..." -n1
  exit 1
fi
echo "  ✅  Python found: $($PYTHON --version)"

# ════════════════════════════════════════════════════════════════════════════
# 2. CHECK NODE / NPM
# ════════════════════════════════════════════════════════════════════════════
echo "  [2/6] Checking Node.js / npm..."
NPM=""
for p in "/opt/homebrew/bin/npm" "/usr/local/bin/npm" "$(which npm 2>/dev/null)"; do
  if [ -x "$p" ]; then NPM="$p"; break; fi
done

if [ -z "$NPM" ]; then
  echo "  ❌  Node.js / npm not found."
  echo ""
  echo "  Please install Node.js from: https://nodejs.org/"
  echo "  Choose the LTS version. Then run this setup again."
  echo ""
  read -p "  Press any key to exit..." -n1
  exit 1
fi
echo "  ✅  npm found: $($NPM --version)"

# ════════════════════════════════════════════════════════════════════════════
# 3. PYTHON VIRTUAL ENVIRONMENT + PACKAGES
# ════════════════════════════════════════════════════════════════════════════
echo "  [3/6] Setting up Python environment..."
cd "$BACKEND_DIR"

if [ ! -d "venv" ]; then
  echo "       Creating virtual environment..."
  "$PYTHON" -m venv venv
  if [ $? -ne 0 ]; then
    echo "  ❌  Failed to create Python virtual environment."
    ERRORS=$((ERRORS+1))
  fi
fi

echo "       Installing Python packages..."
venv/bin/pip install --upgrade pip --quiet
venv/bin/pip install -r requirements.txt --quiet
if [ $? -ne 0 ]; then
  echo "  ❌  Failed to install Python packages."
  ERRORS=$((ERRORS+1))
else
  echo "  ✅  Python packages installed"
fi

# ════════════════════════════════════════════════════════════════════════════
# 4. NPM PACKAGES
# ════════════════════════════════════════════════════════════════════════════
echo "  [4/6] Installing frontend packages..."
cd "$FRONTEND_DIR"
"$NPM" install --silent
if [ $? -ne 0 ]; then
  echo "  ❌  Failed to install npm packages."
  ERRORS=$((ERRORS+1))
else
  echo "  ✅  Frontend packages installed"
fi

# ════════════════════════════════════════════════════════════════════════════
# 5. BUILD FRONTEND
# ════════════════════════════════════════════════════════════════════════════
echo "  [5/6] Building frontend..."
"$NPM" run build --silent
if [ $? -ne 0 ]; then
  echo "  ❌  Frontend build failed."
  ERRORS=$((ERRORS+1))
else
  echo "  ✅  Frontend built"
fi

# ════════════════════════════════════════════════════════════════════════════
# 6. INITIALISE DATABASE
# ════════════════════════════════════════════════════════════════════════════
echo "  [6/6] Initialising database..."
cd "$BACKEND_DIR"
venv/bin/python3 -c "
from app import app, db
from models import seed_default_data
with app.app_context():
    db.create_all()
    seed_default_data()
print('Database ready')
" 2>&1
if [ $? -ne 0 ]; then
  echo "  ❌  Database initialisation failed."
  ERRORS=$((ERRORS+1))
else
  echo "  ✅  Database initialised"
fi

# ════════════════════════════════════════════════════════════════════════════
# DONE
# ════════════════════════════════════════════════════════════════════════════
echo ""
if [ $ERRORS -eq 0 ]; then
  LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║                                                          ║"
  echo "  ║   ✅  Setup Complete!                                    ║"
  echo "  ║                                                          ║"
  echo "  ║   To start the app every day:                            ║"
  echo "  ║   → Double-click  START-SERVER.command                   ║"
  echo "  ║                                                          ║"
  echo "  ║   Then open:  http://$LOCAL_IP:5000                     ║"
  echo "  ║   On WiFi devices too!                                   ║"
  echo "  ║                                                          ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo ""
  echo "  Starting the app now..."
  sleep 2
  open "$APP_DIR/START-SERVER.command"
else
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║   ⚠️   Setup completed with $ERRORS error(s).             ║"
  echo "  ║   Check the messages above and fix, then retry.          ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
fi
echo ""
