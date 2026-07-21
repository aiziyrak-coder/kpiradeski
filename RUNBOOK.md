# KliniKPI — Production Runbook

## Deploy (Docker)

```bash
cp .env.example .env
# .env ni to'ldiring: JWT_SECRET (≥32), POSTGRES_PASSWORD, CORS_ORIGIN, NEXT_PUBLIC_DEMO=false

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Birinchi deploy (bo'sh DB):

```bash
# .env da bir martalik:
ALLOW_INITIAL_SEED=true
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# Keyin ALLOW_INITIAL_SEED=false qiling
```

## Health checks

| Endpoint | Ma'nosi |
|----------|---------|
| `GET /api/health` | DB + API tayyor (readiness) |
| `GET /api/health/live` | Process jon (liveness) |
| Web `/login` | Frontend ishlayapti |

## Secrets rotation

1. **JWT_SECRET** — yangilang → barcha foydalanuvchilar qayta login
2. **TELEGRAM_BOT_TOKEN** — @BotFather → yangi token → `.env` → API restart
3. **OPENAI_API_KEY** — platform dashboard → rotate → `.env`
4. **POSTGRES_PASSWORD** — DB user parolini o'zgartiring + `DATABASE_URL` yangilang

## Backup (PostgreSQL)

```bash
docker exec klinikpi-db pg_dump -U klinikpi klinikpi > backup_$(date +%Y%m%d).sql
```

Restore:

```bash
cat backup.sql | docker exec -i klinikpi-db psql -U klinikpi klinikpi
```

**Upload fayllar:** Docker volume `api_uploads` — muntazam nusxa oling.

## Rollback

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build
# yoki oldingi image tag ga qaytish
```

## TLS (tavsiya)

Productionda 3000/4000 ni to'g'ridan-to'g'ri ochmang. Caddy/Nginx:

- `https://app.domain.uz` → web:3000
- `CORS_ORIGIN=https://app.domain.uz`
- Telegram Mini App URL = HTTPS manzil

## Monitoring (minimal)

- Uptime: `/api/health` har 1 daqiqa (UptimeRobot, etc.)
- Disk: `api_uploads` volume
- Loglar: `docker logs klinikpi-api -f --tail 200`

## Dev-only operatsiyalar

| Env | Vazifa |
|-----|--------|
| `SEED_WIPE=true` | Barcha ma'lumotni o'chirish + qayta seed (**faqat dev**) |
| `prisma db push` | Migration yo'q bo'lsa schema sync (dev) |
| `NEXT_PUBLIC_DEMO=true` | Demo login UI |

## Production taqiqlari

- `SEED_WIPE=true` — API ishga tushmaydi
- Default JWT / DB parollar
- `NEXT_PUBLIC_DEMO=true`
- Postgres portini internetga ochish
- `access_token` query param (isbot fayllar — faqat Authorization header)
