#!/usr/bin/env bash
# KliniKPI — productionga xavfsiz chiqarish.
#
#   deploy/push-to-server.sh <baza-commit> --dry-run    # faqat tekshiruv, serverga hech narsa yozmaydi
#   deploy/push-to-server.sh <baza-commit>              # chiqarish (ruxsat berilgandan keyin)
#   deploy/push-to-server.sh --check <commit>           # serverdagi BARCHA kod shu commitga tengmi (bazani topish)
#
# <baza-commit> — server hozir teng boʻlgan commit (deploy/DEPLOY.md da yoziladi).
# Batafsil tartib: deploy/DEPLOY.md
#
# Muhit (ixtiyoriy):
#   DEPLOY_HOST=87.192.230.208  DEPLOY_PORT=2222   (ofisdan: 192.168.0.101 / 22)
#   DEPLOY_KEY=~/.ssh/imentor_deploy
#   DEPLOY_FORCE_WINDOW=1   — ruxsat etilgan vaqtdan tashqarida chiqarish (faqat egasi aytsa)
set -euo pipefail

HOST="${DEPLOY_HOST:-87.192.230.208}"
PORT="${DEPLOY_PORT:-2222}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/imentor_deploy}"
APP="${DEPLOY_APP:-/home/admin_root/kpiradeski}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml"
WEB_PORT=13000
DOMAIN="kpi.devflix.uz"
# Chiqarish mumkin boʻlgan vaqt (Toshkent): yakshanba kun boʻyi, boshqa kunlar 20:00–07:30
WINDOW_DESC="yakshanba kun boʻyi; Du–Sha 20:00 dan 07:30 gacha (Toshkent)"

SSH=(ssh -p "$PORT" -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=30)
[ -f "$KEY" ] && SSH+=(-i "$KEY")
SSH+=("admin_root@$HOST")

die() { echo "XATO: $*" >&2; exit 1; }
say() { echo; echo "== $*"; }

cd "$(git rev-parse --show-toplevel)"

# Serverga chiqadigan fayllar: api, web va compose. Testlar, skriptlar, hujjatlar chiqmaydi.
deployable() {
  grep -E '^(apps/(api|web)/|docker-compose[^/]*\.yml$)' |
    grep -vE '(^|/)(node_modules|dist|\.next|test|tests|__tests__)/|\.(spec|test)\.[jt]sx?$|tsbuildinfo$|\.md$|\.env' || true
}

# Lokal: commitdagi fayl md5 (CR olib tashlanadi). Faylda yoʻq boʻlsa — MISSING
local_md5() { # commit path
  if git cat-file -e "$1:$2" 2>/dev/null; then
    git show "$1:$2" | tr -d '\r' | md5sum | cut -d' ' -f1
  else
    echo MISSING
  fi
}

# Server: fayllar roʻyxatini stdin orqali beradi, bitta ssh ulanishda "md5  yoʻl" qaytaradi
remote_md5() {
  "${SSH[@]}" "cd '$APP' && while IFS= read -r f; do
      if [ -f \"\$f\" ]; then printf '%s  %s\n' \"\$(tr -d '\r' < \"\$f\" | md5sum | cut -d' ' -f1)\" \"\$f\";
      else printf 'MISSING  %s\n' \"\$f\"; fi
    done"
}

# Parity: serverdagi fayllar <commit> dagi bilan bir xilmi. Farq boʻlsa — ularni chiqaradi va 1 qaytaradi.
parity() { # commit files...
  local commit="$1"; shift
  local remote bad=0 f r l
  remote="$(printf '%s\n' "$@" | remote_md5)" || die "serverga ulanib boʻlmadi ($HOST:$PORT)"
  while IFS= read -r line; do
    r="${line%%  *}"; f="${line#*  }"
    l="$(local_md5 "$commit" "$f")"
    if [ "$r" != "$l" ]; then
      bad=$((bad + 1))
      echo "  FARQ: $f  (server: ${r:0:8}, $commit: ${l:0:8})"
    fi
  done <<< "$remote"
  [ "$bad" -eq 0 ]
}

in_window() {
  local now dow hm
  now="$("${SSH[@]}" "TZ=Asia/Tashkent date '+%u %H%M %F %T'")" || die "server vaqtini olib boʻlmadi"
  dow="${now%% *}"; hm="$(echo "$now" | cut -d' ' -f2)"
  echo "Server vaqti (Toshkent): $(echo "$now" | cut -d' ' -f3-)"
  [ "$dow" = 7 ] && return 0
  [ "$((10#$hm))" -ge 2000 ] || [ "$((10#$hm))" -lt 730 ]
}

# ———————————————————————————————— --check: bazani topish
if [ "${1:-}" = "--check" ]; then
  C="${2:-HEAD}"
  git rev-parse --verify -q "$C^{commit}" >/dev/null || die "commit topilmadi: $C"
  mapfile -t ALL < <(git ls-tree -r --name-only "$C" | deployable)
  say "Serverdagi ${#ALL[@]} ta fayl $C bilan solishtirilmoqda (faqat oʻqish)"
  if parity "$C" "${ALL[@]}"; then
    echo "MOS: server $C ga teng. Shu commit baza boʻladi."
  else
    echo "MOS EMAS. Serverda qoʻlda oʻzgartirilgan yoki boshqa commitdan chiqarilgan fayllar bor."
    echo "Ustidan yozmang — avval serverdagi nusxani lokalga olib, 'server snapshot' commit qiling (DEPLOY.md)."
    exit 2
  fi
  exit 0
fi

# ———————————————————————————————— asosiy rejim
BASE="${1:-}"; DRY=0
[ "${2:-}" = "--dry-run" ] && DRY=1
[ -n "$BASE" ] || die "foydalanish: $0 <baza-commit> [--dry-run]  |  $0 --check <commit>"
git rev-parse --verify -q "$BASE^{commit}" >/dev/null || die "baza commit topilmadi: $BASE"
HEAD_SHA="$(git rev-parse --short HEAD)"

say "1. Commit qilinmagan oʻzgarishlar"
if [ -n "$(git status --porcelain -- apps docker-compose*.yml deploy)" ]; then
  git status --short -- apps docker-compose*.yml deploy
  die "commit qilinmagan oʻzgarish bor — faqat commit qilingan holat chiqariladi"
fi
echo "toza"

say "2. $BASE → $HEAD_SHA: chiqadigan fayllar"
mapfile -t CHANGED < <(git diff --name-only --diff-filter=ACMR "$BASE" HEAD | deployable)
mapfile -t DELETED < <(git diff --name-only --diff-filter=D "$BASE" HEAD | deployable)
[ "${#CHANGED[@]}" -gt 0 ] || [ "${#DELETED[@]}" -gt 0 ] || { echo "chiqadigan oʻzgarish yoʻq"; exit 0; }
printf '  + %s\n' "${CHANGED[@]}"
[ "${#DELETED[@]}" -gt 0 ] && printf '  - %s\n' "${DELETED[@]}"

SERVICES=()
printf '%s\n' "${CHANGED[@]}" "${DELETED[@]}" | grep -q '^apps/api/' && SERVICES+=(api)
printf '%s\n' "${CHANGED[@]}" "${DELETED[@]}" | grep -q '^apps/web/' && SERVICES+=(web)
if printf '%s\n' "${CHANGED[@]}" "${DELETED[@]}" | grep -q '^docker-compose'; then
  SERVICES=(api web)
  echo "  ! compose fayli oʻzgargan — api va web ikkalasi qayta yaratiladi (db tegilmaydi)"
fi
echo "Servislar: ${SERVICES[*]:-yoʻq}"

mapfile -t MIGRATIONS < <(printf '%s\n' "${CHANGED[@]}" | grep -E '^apps/api/prisma/migrations/[^/]+/migration\.sql$' || true)
if [ "${#MIGRATIONS[@]}" -gt 0 ]; then
  say "Yangi migratsiyalar (api ishga tushganda oʻzi qoʻllanadi) — oʻqib chiqing"
  for m in "${MIGRATIONS[@]}"; do
    echo "--- $m"
    git show "HEAD:$m" | sed 's/^/    /'
    if git show "HEAD:$m" | grep -qiE '\b(DROP +(TABLE|COLUMN|SCHEMA)|TRUNCATE|DELETE +FROM)\b'; then
      echo "    !!! DIQQAT: maʼlumot oʻchirishi mumkin boʻlgan buyruq bor"
    fi
  done
fi

say "3. Parity: serverdagi fayllar $BASE bilan bir xilmi"
if ! parity "$BASE" "${CHANGED[@]}" "${DELETED[@]}"; then
  die "serverdagi fayllar bazadan farq qiladi — HECH NARSA yuborilmadi. Farqni koʻrib chiqing (DEPLOY.md: server snapshot)."
fi
echo "hammasi mos"

if [ "$DRY" = 1 ]; then
  say "DRY-RUN tugadi — serverga hech narsa yozilmadi"
  in_window && echo "Hozir chiqarish vaqti: HA" || echo "Hozir chiqarish vaqti: YOʻQ ($WINDOW_DESC)"
  exit 0
fi

say "Vaqt tekshiruvi"
if ! in_window; then
  [ "${DEPLOY_FORCE_WINDOW:-}" = 1 ] || die "hozir chiqarish vaqti emas ($WINDOW_DESC)"
  echo "DEPLOY_FORCE_WINDOW=1 — vaqt tashqarisida chiqarilmoqda"
fi

TS="$(TZ=Asia/Tashkent date +%Y%m%d-%H%M%S)"
BK="backups/push-before-$TS.tgz"

say "4. Backup: fayllar, image va baza"
printf '%s\n' "${CHANGED[@]}" "${DELETED[@]}" | "${SSH[@]}" "cd '$APP' && mkdir -p backups &&
  : > /tmp/kpi-bk-list-$TS && while IFS= read -r f; do [ -f \"\$f\" ] && echo \"\$f\" >> /tmp/kpi-bk-list-$TS; done;
  tar czf '$BK' -T /tmp/kpi-bk-list-$TS && rm -f /tmp/kpi-bk-list-$TS && ls -l '$BK'"
for s in "${SERVICES[@]}"; do
  "${SSH[@]}" "img=\$(docker inspect -f '{{.Config.Image}}' klinikpi-$s) && docker tag \"\$img\" \"\${img%%:*}:before-$TS\" && echo \"image: \${img%%:*}:before-$TS\""
done
"${SSH[@]}" "cd '$APP' && docker exec klinikpi-db sh -c 'pg_dump -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\"' | gzip > backups/db-before-$TS.sql.gz &&
  [ \$(stat -c%s backups/db-before-$TS.sql.gz) -gt 1000 ] && ls -l backups/db-before-$TS.sql.gz" ||
  die "baza backup olinmadi — chiqarish toʻxtatildi"

say "5. Yuklash (faqat commit qilingan holat, bitta tar oqimi)"
if [ "${#CHANGED[@]}" -gt 0 ]; then
  git archive --format=tar HEAD -- "${CHANGED[@]}" | "${SSH[@]}" "cd '$APP' && tar xf - && echo '${#CHANGED[@]} ta fayl yozildi'"
fi
if [ "${#DELETED[@]}" -gt 0 ]; then
  printf '%s\n' "${DELETED[@]}" | "${SSH[@]}" "cd '$APP' && while IFS= read -r f; do rm -f -- \"\$f\"; done && echo '${#DELETED[@]} ta fayl oʻchirildi'"
fi
echo "$HEAD_SHA" | "${SSH[@]}" "cat > '$APP/.deployed-commit'"

BEFORE="$("${SSH[@]}" "docker ps -q | wc -l")"

say "6. Qurish: ${SERVICES[*]}"
"${SSH[@]}" "cd '$APP' && $COMPOSE build ${SERVICES[*]}" || {
  echo "QURISH SINDI. Ishlab turgan konteynerlar tegilmagan. Fayllarni qaytarish: cd $APP && tar xzf $BK"
  exit 1
}

say "7. Ishga tushirish (--no-deps --no-build)"
"${SSH[@]}" "cd '$APP' && $COMPOSE up -d --no-deps --no-build ${SERVICES[*]}"

say "8. Tekshiruv"
ok=0
for i in $(seq 1 30); do
  sleep 5
  st="$("${SSH[@]}" "docker inspect -f '{{.State.Health.Status}}' klinikpi-api klinikpi-web 2>/dev/null | tr '\n' ' '")"
  echo "  health: $st"
  if [ "$st" = "healthy healthy " ]; then ok=1; break; fi
done
codes="$("${SSH[@]}" "curl -s -o /dev/null -w '%{http_code} ' http://127.0.0.1:$WEB_PORT/api/health; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$WEB_PORT/login; true")"
echo "api /api/health: ${codes%% *}"
echo "web /login:      ${codes##* }"
[ "$codes" = "200 200" ] || ok=0
"${SSH[@]}" "
  echo -n 'domen ($DOMAIN): '; curl -sk -o /dev/null -w '%{http_code}\n' -H 'Host: $DOMAIN' https://127.0.0.1/login
  echo 'migratsiya:'; docker logs --since 10m klinikpi-api 2>&1 | grep -iE 'migration|migrate' | tail -5
  echo -n 'xato qatorlar (oxirgi 5 daq): '; docker logs --since 5m klinikpi-api 2>&1 | grep -cE 'Traceback|ERROR|FATAL|Unhandled' || true
  echo \"konteynerlar: oldin $BEFORE, hozir \$(docker ps -q | wc -l)\"
  docker ps -a --filter status=exited --format '  toʻxtagan: {{.Names}} {{.Status}}' | head -10
"

say "9. Orqaga qaytarish yoʻli (kerak boʻlsa)"
cat <<EOF
  cd $APP && tar xzf $BK
EOF
for s in "${SERVICES[@]}"; do
  echo "  docker tag \$(docker inspect -f '{{.Config.Image}}' klinikpi-$s | cut -d: -f1):before-$TS \$(docker inspect -f '{{.Config.Image}}' klinikpi-$s)"
done
cat <<EOF
  cd $APP && $COMPOSE up -d --no-deps --no-build ${SERVICES[*]}
  # baza (faqat migratsiya maʼlumotni buzgan boʻlsa): backups/db-before-$TS.sql.gz
EOF

[ "$ok" = 1 ] || die "tekshiruv oʻtmadi (healthy yoki HTTP 200 emas) — loglarni koʻring, kerak boʻlsa yuqoridagi yoʻl bilan qaytaring"
echo
echo "CHIQARILDI: $HEAD_SHA. Keyingi deploy uchun baza: $HEAD_SHA (DEPLOY.md ga yozing)"
