"""Sync, rebuild api+web, migrate, restart.

Server qoʻllanmasiga mos (umumiy server — 23 loyiha):
- ulanish SSH kalit orqali (~/.ssh dagi kalit); DEPLOY_SSH_PASSWORD — faqat zaxira
- sudo ishlatilmaydi: admin_root docker guruhida
- faqat api va web qayta yaratiladi (--no-deps) — baza tegilmaydi
- boshqa loyihalar konteynerlari soni deploydan oldin/keyin solishtiriladi

  DEPLOY_SSH_HOST  (default 192.168.0.101; tashqaridan: 87.192.230.208)
  DEPLOY_SSH_PORT  (default 22)
  DEPLOY_SSH_PASSWORD  (ixtiyoriy — kalit boʻlmasa)
"""
import os
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("KPI_DEPLOY_PASS") or None
APP = "/home/admin_root/kpiradeski"
ROOT = Path(__file__).resolve().parents[1]
EXCLUDE = {"node_modules", ".next", "dist", ".git", "uploads", "__pycache__", "scratchpad", ".claude"}

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    os.environ.get("DEPLOY_SSH_HOST", "192.168.0.101"),
    port=int(os.environ.get("DEPLOY_SSH_PORT", "22")),
    username="admin_root",
    password=P,
    look_for_keys=True,
    allow_agent=True,
    timeout=30,
)
sftp = c.open_sftp()

tmp = Path(tempfile.gettempdir()) / "kpiradeski-sync.tar.gz"
with tarfile.open(tmp, "w:gz") as tar:
    def filt(info):
        parts = Path(info.name).parts
        if any(p in EXCLUDE for p in parts):
            return None
        if Path(info.name).name in {".env", ".env.local"}:
            return None
        return info
    tar.add(ROOT, arcname="kpiradeski", filter=filt)

sftp.put(str(tmp), "/home/admin_root/kpiradeski-sync.tar.gz")
tmp.unlink(missing_ok=True)

def run(cmd, t=600):
    print("$", cmd[:140])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out[-2000:])
    if err.strip() and code != 0:
        print("ERR:", err[-1000:])
    return code, out

run(f"cp {APP}/.env /home/admin_root/klinikpi.env.bak")
run(
    f"tar -xzf /home/admin_root/kpiradeski-sync.tar.gz -C /tmp && "
    f"rsync -a --exclude=.env /tmp/kpiradeski/ {APP}/ && "
    f"cp /home/admin_root/klinikpi.env.bak {APP}/.env && rm -rf /tmp/kpiradeski /home/admin_root/kpiradeski-sync.tar.gz"
)

compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)
_, before = run("docker ps -q | wc -l")
build_code, _ = run(f"{compose} build api web", t=2400)
if build_code != 0:
    print("BUILD FAILED", build_code)
    sftp.close()
    c.close()
    raise SystemExit(1)
# --no-deps: depends_on orqali bazani qayta yaratmasin
up_code, _ = run(f"{compose} up -d --no-deps api web", t=300)
if up_code != 0:
    print("UP FAILED", up_code)
    sftp.close()
    c.close()
    raise SystemExit(1)
mig_code, mig_out = run(f"{compose} exec -T api npx prisma migrate deploy", t=120)
if mig_code != 0 or "Error" in (mig_out or ""):
    print("MIGRATE FAILED", mig_code)
    sftp.close()
    c.close()
    raise SystemExit(1)
run(f"{compose} restart api web", t=120)
out = "000"
for _ in range(8):
    time.sleep(4)
    _, out = run("curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/login")
    out = (out or "").strip()
    print("WEB LOGIN HTTP:", out)
    if out in ("200", "301", "302", "307", "308"):
        break
if out not in ("200", "301", "302", "307", "308"):
    print("HEALTH CHECK FAILED: login", out)
    sftp.close()
    c.close()
    raise SystemExit(1)
code2, out2 = run("curl -sf http://127.0.0.1:13000/api/kpi/ai-status")
print("AI STATUS:", out2.strip()[:200])
_, after = run("docker ps -q | wc -l")
print(f"KONTEYNERLAR: oldin {before.strip()}, keyin {after.strip()}")
run("docker ps -a --filter status=exited --format '{{.Names}}\t{{.Status}}' | head -20")
sftp.close()
c.close()
print("DEPLOY DONE")
