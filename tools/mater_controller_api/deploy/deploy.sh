#!/usr/bin/env bash
# deploy.sh — push Master Controller API to the VPS and (re)start the systemd service.
# Run from the workspace after the SSH key is authorized on the VPS.
# Never embeds a password; uses key auth only. Secrets are NOT copied from the repo —
# the server-side /etc/master-controller/master-controller.env is created on the VPS.
set -euo pipefail
VPS="${VPS:-masterctl@195.96.132.82}"
KEY="${KEY:-$HOME/.ssh/vps_185_214_108_101_ed25519}"
APP_DIR="/opt/master-controller"
SSH="ssh -i $KEY -o BatchMode=yes"

echo "[1/5] sync API code (no secrets, no node_modules)"
rsync -az --delete -e "ssh -i $KEY -o BatchMode=yes" \
  --exclude node_modules --exclude '.env' --exclude 'data' --exclude 'logs' \
  tools/mater_controller_api/ "$VPS:$APP_DIR/tools/mater_controller_api/"

echo "[2/5] install deps (npm ci if lockfile, else npm i --omit=dev)"
$SSH "$VPS" "cd $APP_DIR/tools/mater_controller_api && (npm ci --omit=dev 2>/dev/null || npm i --omit=dev)"

echo "[3/5] install systemd unit + Caddyfile (sudo)"
$SSH "$VPS" "sudo cp $APP_DIR/tools/mater_controller_api/deploy/master-controller-api.service /etc/systemd/system/ && sudo cp $APP_DIR/tools/mater_controller_api/deploy/Caddyfile /etc/caddy/Caddyfile"

echo "[4/5] reload + restart"
$SSH "$VPS" "sudo systemctl daemon-reload && sudo systemctl enable --now master-controller-api && sudo systemctl restart master-controller-api caddy"

echo "[5/5] health check"
$SSH "$VPS" "curl -fsS http://127.0.0.1:8787/api/v1/health" && echo " OK"
echo "Public: https://<hostname>/api/v1/health"
