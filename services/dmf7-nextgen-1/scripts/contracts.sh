#!/usr/bin/env bash
#
# API CONTRACT TESTS — lock endpoint shapes so any breaking change fails CI.
# These tests validate response structure, NOT functional behaviour (validate.sh
# handles that). The API must already be running on $PORT before invoking this.

API_KEY="${DMF7_API_KEY:-dev-key}"
PORT="${PORT:-5000}"
BASE="http://localhost:$PORT"

PASS=0; FAIL=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL  $1 — $2"; FAIL=$((FAIL+1)); }

# ── helper: check JSON field exists and matches type ─────────────────────────
# Usage: has_field "$json" "field" "type"  (type: string|number|boolean|any)
has_field() {
  local json=$1 field=$2 typ=$3
  local val
  val=$(printf '%s' "$json" | grep -o "\"$field\":[^,}]*" | head -1 | sed "s/\"$field\"://") || true
  if [ -z "$val" ]; then
    return 1
  fi
  case "$typ" in
    string)  echo "$val" | grep -qE '^"' ;;
    number)  echo "$val" | grep -qE '^[0-9]' ;;
    boolean) echo "$val" | grep -qE '^(true|false)' ;;
    any)     return 0 ;;
  esac
}

echo "=== CONTRACT: /state ==="
STATE=$(curl -s "$BASE/state") || true
has_field "$STATE" "status" "string" \
  && ok "/state has status (string)" \
  || fail "/state" "missing or wrong type: status"
has_field "$STATE" "load" "number" \
  && ok "/state has load (number)" \
  || fail "/state" "missing or wrong type: load"
has_field "$STATE" "memory" "number" \
  && ok "/state has memory (number)" \
  || fail "/state" "missing or wrong type: memory"
has_field "$STATE" "uptime" "number" \
  && ok "/state has uptime (number)" \
  || fail "/state" "missing or wrong type: uptime"

echo "=== CONTRACT: /engine/assign ==="
# When queue is empty, assign returns { status: "empty" }
sleep 1.1  # rate limiter window
ASSIGN=$(curl -s -H "x-api-key: $API_KEY" "$BASE/engine/assign") || true
has_field "$ASSIGN" "status" "string" \
  && ok "/engine/assign has status (string)" \
  || fail "/engine/assign" "missing or wrong type: status"
echo "$ASSIGN" | grep -qE '"status":"(ok|empty|paused)"' \
  && ok "/engine/assign status is ok|empty|paused" \
  || fail "/engine/assign" "unexpected status value: $ASSIGN"

# Verify: when paused, assign returns 503 + { status: "paused" }
curl -s -X POST "$BASE/control" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"command":"pause"}' >/dev/null || true
PAUSED_CODE=$(curl -o /dev/null -s -w "%{http_code}" -H "x-api-key: $API_KEY" "$BASE/engine/assign") || true
PAUSED_BODY=$(curl -s -H "x-api-key: $API_KEY" "$BASE/engine/assign") || true
[ "$PAUSED_CODE" = "503" ] \
  && ok "/engine/assign paused → 503" \
  || fail "/engine/assign paused" "expected 503 got $PAUSED_CODE"
echo "$PAUSED_BODY" | grep -q '"status":"paused"' \
  && ok "/engine/assign paused → {status:paused}" \
  || fail "/engine/assign paused body" "got: $PAUSED_BODY"
curl -s -X POST "$BASE/control" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"command":"resume"}' >/dev/null || true

# Verify: when task assigned, response has status:"ok" + task object
sleep 1.1
curl -s -X POST "$BASE/engine/submit" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"payload":"contract-test","expected_output":"contract-test"}' >/dev/null || true
ASSIGNED=$(curl -s -H "x-api-key: $API_KEY" "$BASE/engine/assign") || true
echo "$ASSIGNED" | grep -q '"status":"ok"' \
  && ok "/engine/assign ok → {status:ok, task:{...}}" \
  || fail "/engine/assign ok" "missing status:ok in: $ASSIGNED"
has_field "$ASSIGNED" "task" "any" \
  && ok "/engine/assign ok → task object present" \
  || fail "/engine/assign ok" "missing task field in: $ASSIGNED"

echo "=== CONTRACT: /engine/validate ==="
# Extract task_id from assigned response
CT_ID=$(echo "$ASSIGNED" | grep -o '"id":[0-9]*' | grep -o '[0-9]*$') || true
if [ -n "$CT_ID" ]; then
  # Valid validate → 200 + { status: "ok", result: "success"|"failed" }
  sleep 1.1
  VR=$(curl -s -X POST "$BASE/engine/validate" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d "{\"task_id\":\"$CT_ID\",\"output\":\"contract-test\"}") || true
  echo "$VR" | grep -q '"status":"ok"' \
    && ok "/engine/validate → {status:ok}" \
    || fail "/engine/validate" "missing status:ok in: $VR"
  echo "$VR" | grep -qE '"result":"(success|failed)"' \
    && ok "/engine/validate → result is success|failed" \
    || fail "/engine/validate" "unexpected result in: $VR"

  # Already validated → 409
  sleep 1.1
  VR2_CODE=$(curl -o /dev/null -s -w "%{http_code}" -X POST "$BASE/engine/validate" \
    -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
    -d "{\"task_id\":\"$CT_ID\",\"output\":\"contract-test\"}") || true
  [ "$VR2_CODE" = "409" ] \
    && ok "/engine/validate duplicate → 409" \
    || fail "/engine/validate duplicate" "expected 409 got $VR2_CODE"
else
  fail "/engine/validate" "could not assign task for contract test"
fi

echo "=== CONTRACT: /validate (HMAC) ==="
# Unsigned → 403
HMAC_CODE=$(curl -o /dev/null -s -w "%{http_code}" -X POST "$BASE/validate") || true
[ "$HMAC_CODE" = "403" ] \
  && ok "/validate unsigned → 403" \
  || fail "/validate unsigned" "expected 403 got $HMAC_CODE"

echo "=== CONTRACT: /metrics ==="
METRICS=$(curl -s "$BASE/metrics") || true
for field in tasks_submitted tasks_assigned tasks_completed tasks_failed assign_failures validate_failures last_updated; do
  has_field "$METRICS" "$field" "number" \
    && ok "/metrics has $field (number)" \
    || fail "/metrics" "missing or wrong type: $field"
done

echo "=== CONTRACT: /control ==="
sleep 1.1
CTRL=$(curl -s -X POST "$BASE/control" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"command":"pause"}') || true
has_field "$CTRL" "status" "string" \
  && ok "/control has status (string)" \
  || fail "/control" "missing status"
has_field "$CTRL" "command" "string" \
  && ok "/control has command (string)" \
  || fail "/control" "missing command"
# Resume to leave system clean
curl -s -X POST "$BASE/control" \
  -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
  -d '{"command":"resume"}' >/dev/null || true

# ── summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== CONTRACT RESULT: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] \
  && echo "API CONTRACT LOCKED" \
  || { echo "CONTRACT VIOLATION DETECTED"; exit 1; }
