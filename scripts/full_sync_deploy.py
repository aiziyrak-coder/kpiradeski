"""Sync, rebuild api+web, migrate, restart.

SSH password: set DEPLOY_SSH_PASSWORD (recommended). Fallback only for local ops.
"""
import os
import paramiko
import sys
import tarfile
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("KPI_DEPLOY_PASS")
if not P:
    # Legacy local fallback — rotate if repo is shared
    P = "qazxsw123@!"
    print("WARNING: using hardcoded SSH password; set DEPLOY_SSH_PASSWORD", file=sys.stderr)
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
ROOT = Path(__file__).resolve().parents[1]
EXCLUDE = {"node_modules", ".next", "dist", ".git", "uploads", "__pycache__"}

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    os.environ.get("DEPLOY_SSH_HOST", "192.168.0.101"),
    port=int(os.environ.get("DEPLOY_SSH_PORT", "22")),
    username="admin_root",
    password=P,
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
build_code, _ = run(f"{S} bash -lc '{compose} build api web --no-cache'", t=2400)
if build_code != 0:
    print("BUILD FAILED", build_code)
    sftp.close()
    c.close()
    raise SystemExit(1)
up_code, _ = run(f"{S} bash -lc '{compose} up -d api web'", t=300)
if up_code != 0:
    print("UP FAILED", up_code)
    sftp.close()
    c.close()
    raise SystemExit(1)
mig_code, mig_out = run(f"{S} bash -lc '{compose} exec -T api npx prisma migrate deploy'", t=120)
if mig_code != 0 or "Error" in (mig_out or ""):
    print("MIGRATE FAILED", mig_code)
    sftp.close()
    c.close()
    raise SystemExit(1)
run(f"{S} bash -lc '{compose} restart api web'", t=120)
import time
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
sftp.close()
c.close()
print("DEPLOY DONE")
