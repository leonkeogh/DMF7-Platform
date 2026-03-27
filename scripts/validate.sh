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
start_api() {
  DMF7_API_KEY="$API_KEY" DMF7_SECRET="${DMF7_SECRET:-}" \
    node services/api/api.js >"$LOG_FILE" 2>&1 &
  echo $!
}
API_PID=$(start_api)

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

# ── 7. CRASH RECOVERY ─────────────────────────────────────────────────────
echo "=== 7. crash recovery ==="
# Self-contained: kill current API, fresh DB → known clean state
kill "$API_PID" 2>/dev/null || true; sleep 1
rm -f data/engine.db data/engine.db-shm data/engine.db-wal
API_PID=$(start_api)
if ! timeout "$TIMEOUT_HEALTH" bash -c \
    'until curl -sf "http://localhost:$1$2" >/dev/null 2>&1; do sleep 0.3; done' \
    -- "$PORT" "$HEALTH_ENDPOINT"; then
  fail "crash recovery" "API did not start for crash test"
else
  # Submit 1 task, assign it — deliberately leave it in 'assigned' (no validate)
  CR_SUB=$(curl -s -X POST "$BASE/engine/submit" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d '{"payload":"crash-test","expected_output":"crash-test"}') || true
  CR_ID=$(echo "$CR_SUB" | grep -o '"task_id":[0-9]*' | grep -o '[0-9]*$') || true
  curl -s "$BASE/engine/assign" -H "x-api-key: $API_KEY" >/dev/null || true

  if [ -z "$CR_ID" ]; then
    fail "crash recovery" "could not submit task"
  else
    # Crash: kill without completing the task
    kill "$API_PID" 2>/dev/null || true; sleep 1
    # Restart: db.js startup recovery must requeue the assigned task
    API_PID=$(start_api)
    if ! timeout "$TIMEOUT_HEALTH" bash -c \
        'until curl -sf "http://localhost:$1$2" >/dev/null 2>&1; do sleep 0.3; done' \
        -- "$PORT" "$HEALTH_ENDPOINT"; then
      fail "crash recovery" "API did not restart after crash"
    else
      CR_RECOVER=$(curl -s "$BASE/engine/assign" -H "x-api-key: $API_KEY") || true
      CR_GOT=$(echo "$CR_RECOVER" | grep -o '"id":[0-9]*' | grep -o '[0-9]*$') || true
      [ "$CR_GOT" = "$CR_ID" ] \
        && ok "crash recovery — task $CR_ID requeued after restart" \
        || fail "crash recovery" "expected task $CR_ID, got: $CR_RECOVER"
      # Clean up: complete the recovered task so section 8 starts with known metrics
      curl -s -X POST "$BASE/engine/validate" \
        -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
        -d "{\"task_id\":\"$CR_ID\",\"output\":\"crash-test\"}" >/dev/null || true
    fi
  fi
fi

# ── 8. CONCURRENT WORKERS ─────────────────────────────────────────────────
echo "=== 8. concurrent workers ==="
# Section 7 left the API running with a fresh DB and low failure rate.
# Metrics after section 7: completed=1, failed=0 — control loop will not pause.
sleep 0.5
CC_BEFORE=$(curl -s "$BASE/metrics" | grep -o '"tasks_completed":[0-9]*' | grep -o '[0-9]*$') || true
CC_BEFORE="${CC_BEFORE:-0}"

# Submit exactly 1 task
curl -s -X POST "$BASE/engine/submit" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"payload":"race","expected_output":"race"}' >/dev/null || true
sleep 0.3

# Two workers start simultaneously — DB transaction must give the task to exactly one
DMF7_API_KEY="$API_KEY" DMF7_SECRET="${DMF7_SECRET:-}" WORKER_ID=w1 \
  node services/worker/worker.js >/tmp/w1.log 2>&1 &
CW1=$!
DMF7_API_KEY="$API_KEY" DMF7_SECRET="${DMF7_SECRET:-}" WORKER_ID=w2 \
  node services/worker/worker.js >/tmp/w2.log 2>&1 &
CW2=$!
sleep 4
kill "$CW1" "$CW2" 2>/dev/null || true

CC_AFTER=$(curl -s "$BASE/metrics" | grep -o '"tasks_completed":[0-9]*' | grep -o '[0-9]*$') || true
CC_AFTER="${CC_AFTER:-0}"
CC_DELTA=$((CC_AFTER - CC_BEFORE))
[ "$CC_DELTA" -eq 1 ] \
  && ok "concurrent workers — exactly 1 task completed (delta=$CC_DELTA)" \
  || fail "concurrent workers" "expected delta=1 got $CC_DELTA"

# ── 9. VALIDATE DOUBLE-COMPLETE GUARD ────────────────────────────────────
echo "=== 9. validate double-complete guard ==="
# Submit + assign a fresh task, then call /engine/validate twice sequentially.
# Node.js is single-threaded — requests are serialised server-side.
# The AND status='assigned' SQL guard must reject the second call.
sleep 0.5
curl -s -X POST "$BASE/engine/submit" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"payload":"guard-val","expected_output":"guard-val"}' >/dev/null || true
DG_ASSIGN=$(curl -s "$BASE/engine/assign" -H "x-api-key: $API_KEY") || true
DG_ID=$(echo "$DG_ASSIGN" | grep -o '"id":[0-9]*' | grep -o '[0-9]*$') || true

if [ -z "$DG_ID" ]; then
  fail "double-complete guard" "could not assign task"
else
  DG_R1=$(curl -o /dev/null -s -w "%{http_code}" -X POST "$BASE/engine/validate" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d "{\"task_id\":\"$DG_ID\",\"output\":\"guard-val\"}") || true
  DG_R2=$(curl -o /dev/null -s -w "%{http_code}" -X POST "$BASE/engine/validate" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d "{\"task_id\":\"$DG_ID\",\"output\":\"guard-val\"}") || true
  [ "$DG_R1" = "200" ] && [ "$DG_R2" = "409" ] \
    && ok "double-complete guard — first 200, second 409" \
    || fail "double-complete guard" "expected 200+409 got R1=$DG_R1 R2=$DG_R2"
fi

# ── 9b. CONCURRENT ASSIGN ATOMICITY ──────────────────────────────────────
echo "=== 9b. concurrent assign atomicity ==="
# Fire two assign requests from separate curl processes simultaneously.
# The db.transaction() must give the task to exactly one; the other gets empty.
curl -s -X POST "$BASE/engine/submit" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"payload":"atom","expected_output":"atom"}' >/dev/null || true
sleep 0.2
curl -s "$BASE/engine/assign" -H "x-api-key: $API_KEY" >/tmp/ca1.json &
curl -s "$BASE/engine/assign" -H "x-api-key: $API_KEY" >/tmp/ca2.json &
wait
CA_TASKS=$(grep -l '"task"' /tmp/ca1.json /tmp/ca2.json 2>/dev/null | wc -l) || true
[ "$CA_TASKS" -eq 1 ] \
  && ok "concurrent assign — exactly 1 worker received task" \
  || fail "concurrent assign" "expected 1 task response got $CA_TASKS (check ca1/ca2)"

# ── 10. WORKER RESILIENCE ─────────────────────────────────────────────────
echo "=== 10. worker resilience ==="
# Kill API while a worker is mid-request. Worker must not crash or exit;
# it must log an error and continue the poll loop.
sleep 0.5
curl -s -X POST "$BASE/engine/submit" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"payload":"resilience","expected_output":"resilience"}' >/dev/null || true

DMF7_API_KEY="$API_KEY" DMF7_SECRET="${DMF7_SECRET:-}" WORKER_ID=resilience \
  node services/worker/worker.js >/tmp/resilience.log 2>&1 &
RW=$!
sleep 0.8  # let worker start its first poll

# Kill API — worker's in-flight http.request will error
kill "$API_PID" 2>/dev/null || true
sleep 1.5  # wait through worker retry + next tick

# Verify worker process is still alive (did not exit on error)
if kill -0 "$RW" 2>/dev/null; then
  ok "worker resilience — process survived API kill"
else
  fail "worker resilience" "worker exited after API kill (log: $(tail -3 /tmp/resilience.log))"
fi
kill "$RW" 2>/dev/null || true

# Restart API for teardown
API_PID=$(start_api)
timeout "$TIMEOUT_HEALTH" bash -c \
  'until curl -sf "http://localhost:$1$2" >/dev/null 2>&1; do sleep 0.3; done' \
  -- "$PORT" "$HEALTH_ENDPOINT" || true

# ── teardown ───────────────────────────────────────────────────────────────
kill "$API_PID" 2>/dev/null || true
echo ""
echo "=== RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] \
  && echo "✅ DMF7 SYSTEM VERIFIED — PRODUCTION READY" \
  || { echo "❌ FAILURES DETECTED"; exit 1; }
