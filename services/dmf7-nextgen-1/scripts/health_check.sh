#!/usr/bin/env bash

BASE="http://localhost:${PORT:-5000}"
API_KEY="${DMF7_API_KEY:-dev-key}"
SECRET="${DMF7_SECRET:-}"

fail() { echo "FAIL: $1"; exit 1; }

echo "Checking /state..."
curl -sf "$BASE/state" >/dev/null || fail "/state unreachable"

echo "Checking /health..."
curl -sf "$BASE/health" >/dev/null || fail "/health unreachable"

echo "Running contracts..."
DMF7_API_KEY="$API_KEY" DMF7_SECRET="$SECRET" bash "$(dirname "$0")/contracts.sh" \
  || fail "contracts.sh failed"

echo "HEALTH CHECK PASS"
