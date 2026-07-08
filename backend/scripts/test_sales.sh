#!/bin/bash
# Sales Engine Test Script (curl based)
# Usage:
#   1. Start backend locally with test DB or Neon test branch
#   2. ./backend/scripts/test_sales.sh
#   3. Replace BASE, USER, PASS as needed

set -e

BASE="${VITE_API_URL:-http://localhost:5000}"
USER="owner"
PASS="owner123"   # change to your test creds

echo "=== Logging in ==="
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" | jq -r '.token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "Login failed"
  exit 1
fi

echo "Token obtained"

AUTH="Authorization: Bearer $TOKEN"

echo "=== Get a product ==="
PRODUCT=$(curl -s -H "$AUTH" "$BASE/api/products/" | jq -r '.products[0] | {id, name, selling_price, stock_qty}')
echo "$PRODUCT"

PID=$(echo "$PRODUCT" | jq -r .id)
PRICE=$(echo "$PRODUCT" | jq -r .selling_price)
STOCK=$(echo "$PRODUCT" | jq -r .stock_qty)

echo "Using product $PID @ $PRICE, stock $STOCK"

echo "=== Test 1: Valid sale (under 30% discount) ==="
curl -s -X POST "$BASE/api/sales/" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{
    \"items\": [{\"product_id\": $PID, \"qty\": 1, \"unit_price\": $PRICE, \"discount\": 0}],
    \"payment_method\": \"cash\",
    \"amount_paid\": $PRICE,
    \"discount_pct\": 10,
    \"tax_pct\": 0
  }" | jq '.invoice_number, .total, .discount_amount'

echo "=== Test 2: Discount over 30% should be rejected (422) ==="
curl -s -X POST "$BASE/api/sales/" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{
    \"items\": [{\"product_id\": $PID, \"qty\": 1, \"unit_price\": $PRICE, \"discount\": 0}],
    \"payment_method\": \"cash\",
    \"amount_paid\": $PRICE,
    \"discount_pct\": 35,
    \"tax_pct\": 0
  }" | jq

echo "=== Test 3: Full sale with customer (if exists) ==="
# Add your customer_id if you have one
echo "Done. Check stock and reports manually."
