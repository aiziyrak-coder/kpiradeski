#!/bin/sh
set -e

echo "=== KliniKPI API entrypoint ==="

echo "Waiting for database..."
i=0
until node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.\$queryRaw\`SELECT 1\`.then(()=>p.\$disconnect()).then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "FATAL: database not ready after 60s"
    exit 1
  fi
  echo "  DB not ready ($i)..."
  sleep 1
done

echo "Applying migrations..."
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
else
  echo "WARN: no migrations folder — falling back to db push (dev only)"
  if [ "$NODE_ENV" = "production" ]; then
    echo "FATAL: production requires prisma/migrations — run prisma migrate dev locally first"
    exit 1
  fi
  npx prisma db push --skip-generate --accept-data-loss=false
fi

USER_COUNT=$(node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.user.count()
  .then(c=>{ console.log(c); return p.\$disconnect(); })
  .catch(e=>{ console.error('FATAL count:', e.message); process.exit(1); });
")

# Production: never auto-seed with wipe. Dev: seed empty DB only.
if [ "$USER_COUNT" = "0" ]; then
  if [ "$NODE_ENV" = "production" ] && [ "$ALLOW_INITIAL_SEED" != "true" ]; then
    echo "WARN: empty DB in production — set ALLOW_INITIAL_SEED=true once to create admin, or migrate data"
  else
    echo "Empty database — running initial seed (no wipe unless SEED_WIPE=true)..."
    npx ts-node --transpile-only prisma/seed.ts || {
      echo "FATAL: seed failed"
      exit 1
    }
  fi
elif [ "$SEED_ON_START" = "true" ]; then
  echo "WARN: SEED_ON_START ignored — DB already has $USER_COUNT users"
else
  echo "DB has $USER_COUNT users — skip seed"
fi

mkdir -p uploads/proofs
echo "Starting API..."
exec node dist/src/main.js
