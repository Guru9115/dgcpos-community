#!/bin/sh
APP_PORT="${PORT:-5000}"
echo "=== D&G RetailOS starting on port $APP_PORT ==="

cd /app

# Preload app in master so DB migrations run once (not per worker).
WORKERS="${WEB_CONCURRENCY:-4}"

exec gunicorn app:app \
  --workers "$WORKERS" \
  --preload \
  --timeout 120 \
  --bind "0.0.0.0:$APP_PORT" \
  --log-level info \
  --access-logfile - \
  --error-logfile -
