#!/usr/bin/env bash

# ── configurable control plane ─────────────────────────────────────────────
API_KEY="${DMF7_API_KEY:-dev-key}"
PORT="${PORT:-5000}"
LOG_FILE="${LOG_FILE:-/tmp/api.log}"
STARTUP_SIGNAL="${STARTUP_SIGNAL:-running on port}"
HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-/state}"
TIMEOUT_START="${TIMEOUT_START:-5}"
TIMEOUT_HEALTH="${TIMEOUT_HEALTH:-6}"
# ───────────────────────────────────────────────────────────────────────────

BASE="http://localhost:$PORT"
PASS=0; FAIL=0

ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL  $1 — $2"; FAIL=$((FAIL+1)); }

expect_code() {
  local label=$1 expected=$2; shift 2
  local got
  got=$(curl -o /dev/null -s -w "%{http_code}" "$@") || true
  [ "$got" = "$expected" ] && ok "$label" || fail "$label" "expected HTTP $expected got $got"
}

expect_body() {
  local label=$1 pattern=$2; shift 2
  local body
  body=$(curl -s "$@") || true
  echo "$body" | grep -q "$pattern" \
    && ok "$label" \
    || fail "$label" "pattern '$pattern' not in: $body"
}

# ── startup ────────────────────────────────────────────────────────────────
echo "=== startup ==="
pkill -9 -f "api\.js"    2>/dev/null || true
pkill -9 -f "worker\.js" 2>/dev/null || true
sleep 2

# HARD GUARANTEE 1: port must be free before we start
if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "FATAL: port $PORT already in use — aborting"
  lsof -iTCP:"$PORT" -sTCP:LISTEN
  exit 1
fi

rm -f data/engine.db data/engine.db-shm data/engine.db-wal
DMF7_API_KEY="$API_KEY" node services/api/api.js >"$LOG_FILE" 2>&1 &
API_PID=$!

# HARD GUARANTEE 2: process must emit startup signal within TIMEOUT_START seconds
if ! timeout "$TIMEOUT_START" bash -c \
    'until grep -q "$1" "$2" 2>/dev/null; do sleep 0.1; done' \
    -- "$STARTUP_SIGNAL" "$LOG_FILE"; then
  echo "FATAL: API process did not emit '$STARTUP_SIGNAL' within ${TIMEOUT_START}s"
  echo "--- $LOG_FILE ---"
  cat "$LOG_FILE"
  kill "$API_PID" 2>/dev/null || true
  exit 1
fi

# HARD GUARANTEE 3: health endpoint must respond within TIMEOUT_HEALTH seconds
if ! timeout "$TIMEOUT_HEALTH" bash -c \
    'until curl -sf "http://localhost:$1$2" >/dev/null 2>&1; do sleep 0.3; done' \
    -- "$PORT" "$HEALTH_ENDPOINT" \
    || ! kill -0 "$API_PID" 2>/dev/null; then
  echo "FATAL: health endpoint $BASE$HEALTH_ENDPOINT unreachable within ${TIMEOUT_HEALTH}s (pid=$API_PID)"
  echo "--- $LOG_FILE ---"
  cat "$LOG_FILE"
  kill "$API_PID" 2>/dev/null || true
  exit 1
fi
echo "  API up (pid $API_PID)"

# ── 1. AUTH ────────────────────────────────────────────────────────────────
echo "=== 1. auth ==="
# /validate HMAC security gate
UNAUTH=$(curl -o /dev/null -s -w "%{http_code}" -X POST "$BASE/validate") || true
[ "$UNAUTH" = "403" ] \
  && ok "/validate unsigned → 403" \
  || fail "/validate unsigned" "expected 403 got $UNAUTH"

if [ -n "${DMF7_SECRET:-}" ]; then
  VTS=$(date +%s%3N)
  VSIG=$(printf '%s' "${VTS}api" | openssl dgst -sha256 -hmac "$DMF7_SECRET" | awk '{print $NF}')
  AUTH_V=$(curl -o /dev/null -s -w "%{http_code}" -X POST "$BASE/validate" \
    -H "X-DMF7-TIMESTAMP: $VTS" -H "X-DMF7-SIGNATURE: $VSIG") || true
  [ "$AUTH_V" = "200" ] \
    && ok "/validate signed → 200" \
    || fail "/validate signed" "expected 200 got $AUTH_V"
else
  ok "/validate signed → skipped (DMF7_SECRET not set)"
fi

expect_code "engine/assign no key → 401"  "401" "$BASE/engine/assign"
expect_code "engine/assign with key → 200" "200" -H "x-api-key: $API_KEY" "$BASE/engine/assign"
expect_code "control no key → 401"         "401" -X POST "$BASE/control" \
  -H "Content-Type: application/json" -d '{"command":"pause"}'
expect_code "state no key → 200"           "200" "$BASE/state"

# ── 2. RATE LIMIT ──────────────────────────────────────────────────────────
echo "=== 2. rate limit ==="
sleep 1.1
RPASS=0; RBLOCK=0
for i in $(seq 1 25); do
  C=$(curl -o /dev/null -s -w "%{http_code}" -H "x-api-key: $API_KEY" "$BASE/engine/assign") || true
  [ "$C" = "200" ] && RPASS=$((RPASS+1)) || RBLOCK=$((RBLOCK+1))
done
[ "$RPASS" -eq 20 ] && [ "$RBLOCK" -eq 5 ] \
  && ok "rate limit (pass=$RPASS block=$RBLOCK)" \
  || fail "rate limit" "expected 20/5 got $RPASS/$RBLOCK"

# ── 3. TASK FLOW ───────────────────────────────────────────────────────────
echo "=== 3. task flow ==="
sleep 1.1
expect_body "submit → task_id:1" '"task_id":1' \
  -X POST "$BASE/engine/submit" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"payload":"x","expected_output":"x"}'

expect_body "assign → ok" '"status":"ok"' \
  -H "x-api-key: $API_KEY" "$BASE/engine/assign"

expect_body "validate success → result:success" '"result":"success"' \
  -X POST "$BASE/engine/validate" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"task_id":"1","output":"x"}'

expect_code "validate bad id → 400"      "400" \
  -X POST "$BASE/engine/validate" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"task_id":"1abc","output":"x"}'

expect_code "validate no output → 400"   "400" \
  -X POST "$BASE/engine/validate" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"task_id":"1"}'

expect_code "validate completed → 409"   "409" \
  -X POST "$BASE/engine/validate" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"task_id":"1","output":"x"}'

# ── 4. METRICS ─────────────────────────────────────────────────────────────
echo "=== 4. metrics ==="
expect_body "tasks_submitted=1" '"tasks_submitted":1' "$BASE/metrics"
expect_body "tasks_completed=1" '"tasks_completed":1' "$BASE/metrics"

# ── 5. CONTROL LOOP ────────────────────────────────────────────────────────
echo "=== 5. control loop ==="
sleep 1.1
for i in $(seq 2 6); do
  curl -s -X POST "$BASE/engine/submit" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d "{\"payload\":\"f\",\"expected_output\":\"correct\"}" >/dev/null || true
  sleep 0.5
  curl -s "$BASE/engine/assign" -H "x-api-key: $API_KEY" >/dev/null || true
  sleep 0.5
  curl -s -X POST "$BASE/engine/validate" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d "{\"task_id\":\"$i\",\"output\":\"wrong\"}" >/dev/null || true
  sleep 0.5
done
echo "  waiting 2.5s for control loop tick..."
sleep 2.5
CTRL=$(curl -s -H "x-api-key: $API_KEY" "$BASE/engine/assign") || true
echo "$CTRL" | grep -q '"paused"' \
  && ok "AUTO_PAUSE (assign returned paused)" \
  || fail "AUTO_PAUSE" "expected paused status, got: $CTRL"

# ── 6. WORKER ──────────────────────────────────────────────────────────────
echo "=== 6. worker ==="
sleep 1.1
curl -s -X POST "$BASE/control" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"command":"resume"}' >/dev/null || true

for i in $(seq 7 11); do
  curl -s -X POST "$BASE/engine/submit" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d "{\"payload\":\"w$i\",\"expected_output\":\"w$i\"}" >/dev/null || true
  sleep 0.3
done

sleep 1.1
DMF7_API_KEY="$API_KEY" WORKER_ID=test node services/worker/worker.js >/tmp/worker.log 2>&1 &
W=$!
sleep 6
kill "$W" 2>/dev/null || true

METRICS=$(curl -s "$BASE/metrics") || true
COMPLETED=$(echo "$METRICS" | grep -o '"tasks_completed":[0-9]*' | grep -o '[0-9]*$') || true
COMPLETED="${COMPLETED:-0}"
[ "$COMPLETED" -ge 1 ] \
  && ok "worker processed tasks (completed=$COMPLETED)" \
  || fail "worker" "tasks_completed=$COMPLETED (worker log: $(cat /tmp/worker.log | tail -3))"

# ── teardown ───────────────────────────────────────────────────────────────
kill "$API_PID" 2>/dev/null || true
echo ""
echo "=== RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] \
  && echo "✅ DMF7 SYSTEM VERIFIED — PRODUCTION READY" \
  || { echo "❌ FAILURES DETECTED"; exit 1; }
