#!/usr/bin/env bash
set -euo pipefail

# ── configurable ─────────────────────────────────────────────────────────────
APP_USER="${APP_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/home/ubuntu/DMF7-NextGen}"
REPO_URL="${REPO_URL:-}"          # required: set via env or edit here
SERVICE_NAME="${SERVICE_NAME:-dmf7}"
PORT="${PORT:-5000}"
PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-}"        # e.g. daanamoneyfactory.com
SECONDARY_DOMAINS="${SECONDARY_DOMAINS:-}"  # space-separated, optional
# ─────────────────────────────────────────────────────────────────────────────

log()  { echo "[setup] $*"; }
fail() { echo "[setup] FAIL: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ]       || fail "must run as root (sudo bash deploy/setup.sh)"
[ -n "$REPO_URL" ]         || fail "REPO_URL is not set — export REPO_URL=https://... before running"
[ -n "$PRIMARY_DOMAIN" ]   || fail "PRIMARY_DOMAIN is not set — export PRIMARY_DOMAIN=yourdomain.com before running"

# ── 1. system prep ────────────────────────────────────────────────────────────
log "1/7 system prep"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs npm nginx git curl

node --version  || fail "node not found after install"
nginx -v        2>/dev/null || fail "nginx not found after install"
log "  node $(node --version), nginx ok"

# ── 2. repo setup ─────────────────────────────────────────────────────────────
log "2/7 repo setup"
if [ -d "$APP_DIR/.git" ]; then
  log "  repo exists — pulling latest"
  git -C "$APP_DIR" pull --ff-only
else
  log "  cloning $REPO_URL → $APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 3. node setup ─────────────────────────────────────────────────────────────
log "3/7 node setup"
cd "$APP_DIR"
sudo -u "$APP_USER" npm ci --omit=dev
sudo -u "$APP_USER" npm rebuild better-sqlite3
node -e "require('better-sqlite3')" || fail "better-sqlite3 native binding failed"
log "  dependencies ok"

# ── 4. env setup ──────────────────────────────────────────────────────────────
log "4/7 env setup"
ENV_FILE="$APP_DIR/.env.production"
if [ -f "$ENV_FILE" ]; then
  log "  .env.production already exists — not overwriting"
else
  log "  creating .env.production template — EDIT before starting service"
  cat > "$ENV_FILE" <<'EOF'
DMF7_API_KEY=CHANGE_ME
DMF7_SECRET=CHANGE_ME
PORT=5000
EOF
  chown "$APP_USER:$APP_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  log "  WARNING: .env.production has placeholder values — edit it now, then re-run"
fi

# Warn if placeholder values are still present
if grep -q "CHANGE_ME" "$ENV_FILE"; then
  fail ".env.production still has placeholder values — set real DMF7_API_KEY and DMF7_SECRET"
fi

# ── 5. systemd ────────────────────────────────────────────────────────────────
log "5/7 systemd"
UNIT_SRC="$APP_DIR/deploy/dmf7.service"
UNIT_DST="/etc/systemd/system/${SERVICE_NAME}.service"
[ -f "$UNIT_SRC" ] || fail "deploy/dmf7.service not found in repo"

# Substitute user + working directory
sed \
  -e "s|User=.*|User=$APP_USER|" \
  -e "s|WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" \
  -e "s|EnvironmentFile=.*|EnvironmentFile=$APP_DIR/.env.production|" \
  -e "s|ExecStart=.*|ExecStart=$(which node) services/api/api.js|" \
  "$UNIT_SRC" > "$UNIT_DST"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
sleep 2
systemctl is-active --quiet "$SERVICE_NAME" \
  || { journalctl -u "$SERVICE_NAME" --no-pager -n 20; fail "service failed to start"; }
log "  $SERVICE_NAME is active"

# ── 6. nginx (multi-domain control layer) ────────────────────────────────────
log "6/7 nginx"
NGINX_CONF="/etc/nginx/sites-available/$SERVICE_NAME"

if [ ! -f "$NGINX_CONF" ]; then
  log "  creating nginx config (primary=$PRIMARY_DOMAIN)"
  cat > "$NGINX_CONF" <<EOF
# Primary domain — proxied to API
server {
    listen 80;
    server_name ${PRIMARY_DOMAIN} www.${PRIMARY_DOMAIN};

    location / {
        proxy_pass         http://localhost:${PORT};
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }
}

# Catch-all — any other domain pointing at this VPS → 301 to primary
server {
    listen 80 default_server;
    server_name _;

    return 301 http://${PRIMARY_DOMAIN}\$request_uri;
}
EOF
  log "  nginx config created"
else
  log "  nginx config already exists — not overwriting"
fi

# Idempotent symlink
ln -sf "$NGINX_CONF" "/etc/nginx/sites-enabled/$SERVICE_NAME"

# Remove default site if present — it would conflict with default_server above
if [ -f /etc/nginx/sites-enabled/default ] || [ -L /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
  log "  removed default nginx site"
fi

nginx -t || fail "nginx config test failed"
systemctl restart nginx
log "  nginx restarted"

# ── 7. verify ─────────────────────────────────────────────────────────────────
log "7/7 verify"
for i in $(seq 1 10); do
  STATUS=$(curl -o /dev/null -s -w "%{http_code}" "http://localhost:$PORT/state") || true
  if [ "$STATUS" = "200" ]; then
    log "  /state → 200 ok"
    break
  fi
  [ "$i" -lt 10 ] || fail "/state did not return 200 after 10s (got $STATUS)"
  sleep 1
done

log ""
VPS_IP=$(curl -sf https://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "DEPLOYMENT COMPLETE"
log "  service : $SERVICE_NAME (systemd)"
log "  port    : $PORT (internal)"
log "  primary : http://$PRIMARY_DOMAIN → localhost:$PORT"
log "  catch-all: all other domains → 301 → http://$PRIMARY_DOMAIN"
log ""
log "Next steps:"
log "  1. Set DNS A record: $PRIMARY_DOMAIN → $VPS_IP"
[ -n "$SECONDARY_DOMAINS" ] && log "  2. Set DNS A record for secondary domains → $VPS_IP (catch-all will redirect)"
log "  3. Install SSL: sudo certbot --nginx -d $PRIMARY_DOMAIN -d www.$PRIMARY_DOMAIN"
log "  4. Health check: DMF7_API_KEY=... DMF7_SECRET=... bash scripts/health_check.sh"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
