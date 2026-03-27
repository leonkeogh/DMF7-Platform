#!/usr/bin/env bash
# ops.sh — daily operations for DMF7 production
# Usage: bash scripts/ops.sh <command>

API_KEY="${DMF7_API_KEY:-dev-key}"
BASE="http://localhost:${PORT:-5000}"
SERVICE="dmf7"

cmd="${1:-help}"

case "$cmd" in

  status)
    echo "=== systemd ==="
    systemctl is-active "$SERVICE" && echo "  ACTIVE" || echo "  INACTIVE"
    echo ""
    echo "=== health ==="
    curl -sf "$BASE/health" && echo "" || echo "  UNREACHABLE"
    echo ""
    echo "=== metrics ==="
    curl -sf "$BASE/metrics" | tr ',' '\n' | tr -d '{}"' | sed 's/^/  /'
    ;;

  logs)
    # tail last 50 lines; -f to follow live
    journalctl -u "$SERVICE" -n "${2:-50}" --no-pager
    ;;

  follow)
    journalctl -u "$SERVICE" -f
    ;;

  events)
    # Query the SQLite event log directly
    DB="${APP_DIR:-/home/ubuntu/DMF7-NextGen}/data/engine.db"
    [ -f "$DB" ] || { echo "DB not found: $DB"; exit 1; }
    node -e "
      const db = require('better-sqlite3')('$DB', { readonly: true });
      const rows = db.prepare('SELECT datetime(created_at/1000,\"unixepoch\") as ts, type, payload FROM events ORDER BY id DESC LIMIT ${2:-20}').all();
      rows.forEach(r => console.log(r.ts, r.type.padEnd(10), r.payload));
    "
    ;;

  restart)
    echo "Restarting $SERVICE..."
    systemctl restart "$SERVICE"
    sleep 2
    systemctl is-active --quiet "$SERVICE" && echo "  OK — service active" || { echo "  FAILED"; journalctl -u "$SERVICE" -n 20 --no-pager; exit 1; }
    curl -sf "$BASE/state" >/dev/null && echo "  OK — /state responding" || echo "  WARN — /state not yet responding"
    ;;

  pause)
    curl -sf -X POST "$BASE/control" \
      -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
      -d '{"command":"pause"}' && echo ""
    ;;

  resume)
    curl -sf -X POST "$BASE/control" \
      -H "Content-Type: application/json" -H "x-api-key: $API_KEY" \
      -d '{"command":"resume"}' && echo ""
    ;;

  check|contracts)
    DMF7_API_KEY="$API_KEY" bash "$(dirname "$0")/health_check.sh"
    ;;

  health)
    echo "=== /state ==="
    curl -sf "$BASE/state" && echo "" || echo "  UNREACHABLE"
    echo "=== /health ==="
    curl -sf "$BASE/health" && echo "" || echo "  UNREACHABLE"
    ;;

  errors|failures)
    # Show only error-level log lines from the service
    journalctl -u "$SERVICE" -n "${2:-100}" --no-pager \
      | grep -i "error\|fail\|fatal\|quarantine\|PAUSE\|EMERGENCY" || echo "  (no errors found)"
    ;;

  help|*)
    echo "Usage: bash scripts/ops.sh <command>"
    echo ""
    echo "Commands:"
    echo "  status          — service state + health + metrics snapshot"
    echo "  logs [N]        — last N log lines (default 50)"
    echo "  follow          — live log tail"
    echo "  events [N]      — last N event log entries from SQLite"
    echo "  errors [N]      — filter logs for errors/failures/pauses"
    echo "  restart         — safe restart with verification"
    echo "  pause           — pause task assignment"
    echo "  resume          — resume task assignment"
    echo "  check           — run full health_check.sh + contracts"
    ;;

esac
