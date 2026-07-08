#!/bin/bash
# Start local instance against Neon test branch
# 1. Create a branch in Neon dashboard (e.g. "test")
# 2. Copy the connection string for the branch
# 3. Run: export DATABASE_URL="postgresql://..."
# 4. ./backend/scripts/start_local_neon.sh

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: Set DATABASE_URL first, e.g."
  echo "export DATABASE_URL='postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require'"
  exit 1
fi

cd "$(dirname "$0")/.."

echo "Activating venv..."
source venv/bin/activate

echo "Running migrations (alembic)..."
alembic upgrade head

echo "Starting server on http://localhost:5001 ..."
export PORT=5001
export FLASK_ENV=development
python -m flask --app app:app run --host=0.0.0.0 --port=5001 --debug
