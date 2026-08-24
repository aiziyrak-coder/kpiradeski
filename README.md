# KliniKPI

Xususiy dermatologiya klinikasi uchun avtomatlashtirilgan KPI-monitoring platformasi.

## Stack

- **Frontend:** Next.js 15 + TypeScript + Tailwind (Telegram Mini App ready)
- **Backend:** NestJS + Prisma + PostgreSQL + JWT RBAC
- **Infra:** Docker Compose

## Tezkor ishga tushirish (Development)

```bash
cp .env.example .env
# JWT_SECRET ni o'zgartiring (min 32 belgi)

docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:4000/api/health
- DB: `127.0.0.1:5433` (faqat localhost)

## Production

Batafsil: [RUNBOOK.md](./RUNBOOK.md)

```bash
cp .env.example .env
# Production qiymatlar: CORS_ORIGIN, kuchli JWT, NEXT_PUBLIC_DEMO=false

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

## Lokal development (Docker siz)

### API

```bash
cd apps/api
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy   # yoki dev: npx prisma db push
npm run prisma:seed         # bo'sh DB uchun
npm run start:dev
```

**Ma'lumotni tozalash (faqat dev):** `SEED_WIPE=true npm run prisma:seed` (Windows: `$env:SEED_WIPE='true'; npm run prisma:seed`)

### Web

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

## Demo hisoblar (faqat `NEXT_PUBLIC_DEMO=true`)

Parol: `klinikpi123`

| Email | Rol |
|-------|-----|
| super@klinikpi.uz | Super Admin |
| manager@klinikpi.uz | Menejer |

Productionda demo UI o'chirilgan bo'lishi kerak.

## Asosiy imkoniyatlar

- Kunlik vazifalar (har biri alohida, 06:00 spawn, dam olish kunlari)
- KPI chek-listlar, dashboard, AI tahlil
- Telegram bot + Mini App kirish
- RBAC, audit log, PDF/Excel hisobotlar

## Sozlamalar

| O'zgaruvchi | Vazifa |
|-------------|--------|
| `JWT_SECRET` | ≥32 belgi, tasodifiy |
| `CORS_ORIGIN` | Production domen(lar) |
| `OPENAI_API_KEY` | AI hisobotlar |
| `TELEGRAM_BOT_TOKEN` | Bot + Mini App imzo |
| `TELEGRAM_CHAT_ID` | Guruh buyruqlari |
| `NEXT_PUBLIC_DEMO` | `false` productionda |

## Xavfsizlik

- Isbot fayllar faqat `Authorization: Bearer` orqali
- Productionda LAN CORS bypass o'chirilgan
- Global rate limit: 600 req/min/IP (`API_RATE_LIMIT` bilan sozlanadi)
- Seed wipe productionda bloklangan

**Muhim:** `.env` fayllarini hech qachon gitga qo'shmang. Tokenlarni chatda ulashmang — rotate qiling.
