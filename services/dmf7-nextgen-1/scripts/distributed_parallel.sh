#!/usr/bin/env bash
# DMF7 Parallel Validation Orchestrator
# Validates independent services concurrently, respecting dependency levels.
#
# Usage:
#   bash scripts/distributed_parallel.sh
#
# Overridable env vars:
#   REGISTRY      — path to services.json  (default: config/services.json)
#   TMP_DIR       — result directory       (default: /tmp/dmf7_parallel)
#   CALL_TIMEOUT  — per-service curl timeout in seconds (default: 8)
#   MAX_LEVELS    — maximum level index to process (default: 10)

REGISTRY="${REGISTRY:-config/services.json}"
TMP_DIR="${TMP_DIR:-/tmp/dmf7_parallel}"
CALL_TIMEOUT="${CALL_TIMEOUT:-8}"
MAX_LEVELS="${MAX_LEVELS:-10}"

# ── preflight ────────────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
  echo "FATAL: jq is required but not installed"
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "FATAL: openssl is required but not installed"
  exit 1
fi

if [ -z "${DMF7_SECRET:-}" ]; then
  echo "FATAL: DMF7_SECRET is not set — cannot sign validation requests"
  exit 1
fi

if [ ! -f "$REGISTRY" ]; then
  echo "FATAL: service registry not found: $REGISTRY"
  exit 1
fi

mkdir -p "$TMP_DIR"
rm -f "$TMP_DIR"/*.json "$TMP_DIR"/fail.*

# ── per-service validator ────────────────────────────────────────────────────
# Runs in a subshell background process. Writes result JSON and a sentinel
# file on failure so the parent can detect it after wait.
validate_service() {
  local svc="$1"
  local host port path url ts sig response status

  host=$(jq -r ".\"$svc\".host"          "$REGISTRY")
  port=$(jq -r ".\"$svc\".port"          "$REGISTRY")
  path=$(jq -r ".\"$svc\".validate_path" "$REGISTRY")
  url="http://${host}:${port}${path}"

  # Sign the request: HMAC_SHA256(SECRET, TIMESTAMP + SERVICE_NAME)
  ts=$(date +%s%3N)
  sig=$(printf '%s' "${ts}${svc}" \
    | openssl dgst -sha256 -hmac "$DMF7_SECRET" 2>/dev/null \
    | awk '{print $NF}')

  response=$(timeout "$CALL_TIMEOUT" curl -s -X POST "$url" \
    -H "X-DMF7-TIMESTAMP: $ts" \
    -H "X-DMF7-SIGNATURE: $sig" \
    2>/dev/null \
    || echo "{\"status\":\"FAIL\",\"reason\":\"TIMEOUT\",\"service\":\"$svc\"}")

  echo "$response" > "$TMP_DIR/${svc}.json"

  # Validate JSON and extract status — invalid JSON treated as FAIL
  status=$(echo "$response" | jq -e -r '.status' 2>/dev/null) || status="INVALID_JSON"

  if [ "$status" = "VALID" ]; then
    echo "  OK:   $svc ($url)"
  else
    echo "  FAIL: $svc ($url) — status=$status — $response"
    touch "$TMP_DIR/fail.${svc}"
    exit 1
  fi
}

# ── level executor ───────────────────────────────────────────────────────────
# Runs all services at a given dependency level in parallel, then waits.
# Returns 1 if any service in the level failed.
run_level() {
  local level="$1"
  local svcs pids=()

  svcs=$(jq -r "to_entries[] | select(.value.level == $level) | .key" "$REGISTRY")

  [ -z "$svcs" ] && return 0  # no services at this level — skip silently

  echo "--- level $level ---"

  for svc in $svcs; do
    validate_service "$svc" &
    pids+=($!)
  done

  # Wait for each PID individually — reliable exit-code capture
  local level_fail=0
  for pid in "${pids[@]}"; do
    wait "$pid" || level_fail=1
  done

  return "$level_fail"
}

# ── orchestration ────────────────────────────────────────────────────────────
echo "=== DMF7 Parallel Validation ==="
echo "registry: $REGISTRY"
echo "timeout:  ${CALL_TIMEOUT}s per service"
echo ""

GLOBAL_FAIL=0

for lvl in $(seq 0 "$MAX_LEVELS"); do
  # Check if any services exist at this level before attempting
  count=$(jq "[to_entries[] | select(.value.level == $lvl)] | length" "$REGISTRY")
  [ "$count" -eq 0 ] && continue

  run_level "$lvl" || { GLOBAL_FAIL=1; break; }
done

# ── result aggregation ───────────────────────────────────────────────────────
echo ""
if [ "$GLOBAL_FAIL" -ne 0 ]; then
  echo "=== GLOBAL FAILURE DETECTED ==="
  echo ""
  echo "--- diagnostic dump ---"
  for f in "$TMP_DIR"/*.json; do
    [ -f "$f" ] || continue
    svc=$(basename "$f" .json)
    echo "[$svc]"
    cat "$f"
    echo ""
  done
  exit 1
fi

echo "=== GLOBAL SYSTEM VALID ==="
exit 0
