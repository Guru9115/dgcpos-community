"""
SQLite → PostgreSQL Migration Script
Copies ALL data from retailos.db to Neon PostgreSQL.
Safe to run multiple times — clears PG tables before inserting.
"""

import sqlite3, os, sys
from datetime import datetime

SQLITE_PATH = os.path.join(os.path.dirname(__file__), 'retailos.db')
PG_URL = 'os.environ.get('DATABASE_URL')'

print("=" * 60)
print("  DG RetailOS — SQLite → PostgreSQL Migration")
print("=" * 60)

# ── Step 1: Create all tables in PostgreSQL via SQLAlchemy ─────
print("\n[1/4] Creating tables on PostgreSQL...")
os.environ['DATABASE_URL'] = PG_URL

from app import create_app
from models import db

app = create_app()
with app.app_context():
    db.create_all()
    print("      ✅ All tables created on PostgreSQL")

# ── Step 2: Connect to both databases ─────────────────────────
print("\n[2/4] Connecting to both databases...")
import psycopg2
from psycopg2.extras import execute_values

sqlite_conn = sqlite3.connect(SQLITE_PATH)
sqlite_conn.row_factory = sqlite3.Row
sc = sqlite_conn.cursor()

pg_conn = psycopg2.connect(PG_URL)
pg_conn.autocommit = False
pc = pg_conn.cursor()
print("      ✅ Both connections open")

# ── Helper ─────────────────────────────────────────────────────
def migrate_table(table):
    sc.execute(f'SELECT * FROM "{table}"')
    rows = sc.fetchall()
    if not rows:
        print(f"      ⚪ {table}: empty")
        return 0
    cols = [d[0] for d in sc.description]
    col_str = ','.join(f'"{c}"' for c in cols)

    # Clear existing rows in PG
    pc.execute(f'DELETE FROM "{table}"')

    # Convert row values — SQLite stores booleans as 0/1 integers
    bool_cols = {'is_active', 'is_vip', 'has_variants', 'membership_enabled',
                 'must_change_password', 'is_urgent'}
    def convert_row(row):
        result = []
        for col, val in zip(cols, row):
            if col in bool_cols and val is not None:
                result.append(bool(val))
            else:
                result.append(val)
        return tuple(result)

    values = [convert_row(r) for r in rows]
    execute_values(pc, f'INSERT INTO "{table}" ({col_str}) VALUES %s ON CONFLICT DO NOTHING', values, page_size=200)
    print(f"      ✅ {table}: {len(rows)} rows")
    return len(rows)

# ── Step 3: Migrate all tables in FK-safe order ───────────────
print("\n[3/4] Migrating data (FK-safe order)...")

# Tables listed in dependency order — parents before children
tables = [
    'users',
    'categories',
    'products',
    'product_variants',
    'customers',
    'point_transactions',
    'suppliers',
    'purchases',
    'purchase_items',
    'purchase_orders',
    'purchase_order_items',
    'sales',
    'sale_items',
    'promotions',
    'gift_cards',
    'alterations',
    'layaways',
    'layaway_items',
    'layaway_payments',
    'deliveries',
    'delivery_items',
    'inventory_movements',
    'expenses',
    'staff_targets',
    'cashier_sessions',
    'settings',
    'audit_logs',
    'dsr_entries',
    'dsr_purchases',
    'dsr_fixed_costs',
]

total = 0
failed = []
for t in tables:
    # Check if table exists in SQLite
    sc.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (t,))
    if not sc.fetchone():
        print(f"      ⚪ {t}: not in SQLite — skipping")
        continue
    try:
        total += migrate_table(t)
        pg_conn.commit()
    except Exception as e:
        pg_conn.rollback()
        failed.append((t, str(e)))
        print(f"      ❌ {t}: {e}")

# ── Step 4: Fix sequences (PostgreSQL auto-increment) ─────────
print("\n[4/4] Fixing auto-increment sequences...")
seq_tables = [
    'users', 'categories', 'products', 'product_variants',
    'customers', 'point_transactions', 'suppliers', 'purchases',
    'purchase_items', 'purchase_orders', 'purchase_order_items',
    'sales', 'sale_items', 'promotions', 'gift_cards',
    'alterations', 'layaways', 'layaway_items', 'layaway_payments',
    'deliveries', 'delivery_items', 'inventory_movements',
    'expenses', 'staff_targets', 'cashier_sessions',
    'settings', 'audit_logs', 'dsr_entries', 'dsr_purchases', 'dsr_fixed_costs',
]
for t in seq_tables:
    try:
        pc.execute(f"""
            SELECT setval(pg_get_serial_sequence('"{t}"', 'id'),
                   COALESCE((SELECT MAX(id) FROM "{t}"), 1))
        """)
    except Exception:
        pass  # table has no sequence (e.g., settings uses key not id)

pg_conn.commit()
print("      ✅ Sequences updated")

sqlite_conn.close()
pg_conn.close()

print("\n" + "=" * 60)
print(f"  ✅ Migration complete — {total} rows moved")
if failed:
    print(f"  ⚠️  {len(failed)} table(s) had errors:")
    for t, e in failed:
        print(f"     • {t}: {e}")
print("=" * 60)
print()
print("  NEXT STEP: Add this to Railway environment variables:")
print(f"  DATABASE_URL = {PG_URL}")
print()
print("  ⚠️  SECURITY: Rotate your Neon password after adding to Railway!")
print("=" * 60)
