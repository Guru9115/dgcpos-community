#!/bin/bash
# ============================================================
#  D&G Collection RetailOS — Stop All Services
# ============================================================

echo ""
echo "→ Stopping RetailOS..."
pkill -f "venv/bin/python3 app.py" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1
echo "✅ RetailOS stopped."
echo ""
echo "  Press any key to close..."
read -n 1
