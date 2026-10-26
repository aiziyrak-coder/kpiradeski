#!/bin/bash
set -euo pipefail

echo "Bu skript eskirgan (parity yoʻq, --no-deps yoʻq). Ishlating: deploy/push-to-server.sh — deploy/DEPLOY.md" >&2
exit 1

APP_DIR="/home/admin_root/kpiradeski"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml"

cd "$APP_DIR"

echo "=== KliniKPI deploy ==="
$COMPOSE pull 2>/dev/null || true
$COMPOSE up -d --build

echo "Waiting for health..."
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:13000/login >/dev/null 2>&1; then
    echo "Web OK"
    break
  fi
  sleep 5
done

curl -sf http://127.0.0.1:13000/login >/dev/null || { echo "Web health failed"; exit 1; }
echo "Deploy complete."
