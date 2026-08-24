#!/bin/bash
set -e
cd /home/admin_root/kpiradeski
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml"

echo "=== indexes ==="
$COMPOSE exec -T db psql -U klinikpi -d klinikpi -c "SELECT indexname FROM pg_indexes WHERE tablename = 'DailyScore';"

echo "=== drop leftover index ==="
$COMPOSE exec -T db psql -U klinikpi -d klinikpi -c 'DROP INDEX IF EXISTS "DailyScore_date_key";'

echo "=== migration logs ==="
$COMPOSE exec -T db psql -U klinikpi -d klinikpi -c "SELECT migration_name, finished_at IS NOT NULL AS ok, left(coalesce(logs,''), 500) AS logs FROM _prisma_migrations WHERE migration_name LIKE '%dailyscore%' OR migration_name LIKE '%fix_daily%';"

echo "=== resolve migration ==="
# api may be down; use a one-off prisma container or run via docker run
$COMPOSE run --rm --no-deps api npx prisma migrate resolve --applied 20260721193000_fix_dailyscore_unique_date || true

echo "=== ensure resolved via SQL if needed ==="
$COMPOSE exec -T db psql -U klinikpi -d klinikpi <<'SQL'
UPDATE "_prisma_migrations"
SET finished_at = COALESCE(finished_at, NOW()),
    logs = NULL,
    rolled_back_at = NULL,
    applied_steps_count = 1
WHERE migration_name = '20260721193000_fix_dailyscore_unique_date';
SQL

echo "=== restart api ==="
$COMPOSE up -d api web
sleep 8
$COMPOSE ps
$COMPOSE logs api --tail 40
