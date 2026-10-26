# KliniKPI — productionga chiqarish tartibi

Yagona yoʻl: `deploy/push-to-server.sh`. Eski `deploy/server-deploy.sh` va
`scripts/*deploy*.py` ishlatilmaydi — ular serverdagi fayllarni tekshirmasdan
ustidan yozardi va `--no-deps` siz konteyner koʻtarardi.

## Server

| | |
|---|---|
| SSH (tashqaridan) | `admin_root@87.192.230.208`, port `2222` |
| SSH (ofisdan) | `admin_root@192.168.0.101`, port `22` |
| Kalit | `~/.ssh/imentor_deploy` |
| Papka | `/home/admin_root/kpiradeski` (git repo emas) |
| Compose | `docker-compose.yml` + `docker-compose.prod.yml` + `docker-compose.server.yml` |
| Konteynerlar | `klinikpi-db`, `klinikpi-api`, `klinikpi-web` — faqat shularga tegiladi |
| Port | web `127.0.0.1:13000` (api web orqali `/api/*`) |
| Domen | `kpi.devflix.uz` (host nginx → 13000) |
| Health | `/api/health` va `/login` → 200; konteynerlar `healthy` |
| Migratsiya | api konteyneri ishga tushganda `prisma migrate deploy` oʻzi bajariladi |
| Env | `/home/admin_root/kpiradeski/.env` — skript unga tegmaydi |

Serverda ~30 ta boshqa loyiha bor. `down`, `prune`, `--remove-orphans`, boshqa
konteynerni restart qilish — taqiqlangan. `sudo` ishlatilmaydi (admin_root docker guruhida).
Server ichidan oʻz domeniga curl ishlamaydi — tekshiruv `127.0.0.1:13000` orqali.

## Chiqarish vaqti

Yakshanba kun boʻyi; Du–Sha 20:00 dan 07:30 gacha (Toshkent). Skript server
soatini oʻzi tekshiradi. Boshqa vaqtda faqat egasi aytsa: `DEPLOY_FORCE_WINDOW=1`.

## Baza commit

Server hozir qaysi commitga teng — keyingi deploy shu bazadan farqni chiqaradi.

| Sana | Baza commit | Izoh |
|---|---|---|
| — | **aniqlanmagan** | Birinchi marta: `deploy/push-to-server.sh --check <commit>` bilan toping |

Har chiqarishdan keyin yangi qator qoʻshing (skript oxirida commit chiqaradi;
serverda `.deployed-commit` faylida ham yoziladi).

## Birinchi marta: bazani topish (faqat oʻqish)

```bash
deploy/push-to-server.sh --check 5dfef36     # main — ehtimoliy baza
```

- `MOS` — server shu commitga teng, u baza boʻladi.
- `MOS EMAS` — serverda qoʻlda oʻzgartirilgan fayl bor. **Ustidan yozilmaydi.**
  Farqli fayllarni serverdan olib keling (`ssh ... "cat <yoʻl>" > <yoʻl>`),
  alohida `server snapshot` commit qiling va shu commitni baza qiling.

## Har deployda

1. Tekshiruvlar: `apps/api` va `apps/web` da `npx tsc --noEmit`, commit.
2. `deploy/push-to-server.sh <baza> --dry-run` — chiqadigan fayllar, servislar,
   yangi migratsiyalar matni va parity. Serverga hech narsa yozmaydi.
3. Egasidan ruxsat: nima chiqadi, uzilish (~1–3 daqiqa: api/web qayta yaratiladi), qachon.
4. `deploy/push-to-server.sh <baza>` — ketma-ket:
   parity → backup (fayllar `backups/push-before-<vaqt>.tgz`, image `:before-<vaqt>`,
   baza `backups/db-before-<vaqt>.sql.gz`) → yuklash (`git archive HEAD`, bitta ssh) →
   `build` → `up -d --no-deps --no-build` → healthy + HTTP 200 + loglar.
5. Oʻzgargan funksiyani haqiqiy soʻrov bilan tekshirish, natijani egasiga yozish.
6. Bu fayldagi baza jadvaliga yangi commitni yozish.

## Orqaga qaytarish (faqat egasi aytsa yoki tekshiruv sinsa)

Skript oxirida aniq buyruqlarni chiqaradi. Umumiy koʻrinishi:

```bash
cd /home/admin_root/kpiradeski && tar xzf backups/push-before-<vaqt>.tgz
docker tag kpiradeski-api:before-<vaqt> kpiradeski-api:latest   # web uchun ham
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml \
  up -d --no-deps --no-build api web
```

Migratsiya bazani buzgan boʻlsa — `backups/db-before-<vaqt>.sql.gz` dan tiklash
(egasi bilan kelishib, alohida).
