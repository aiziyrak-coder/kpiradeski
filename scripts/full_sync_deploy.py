"""Sync, rebuild api+web, migrate, restart."""
import paramiko
import sys
import tarfile
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
ROOT = Path(__file__).resolve().parents[1]
EXCLUDE = {"node_modules", ".next", "dist", ".git", "uploads", "__pycache__"}

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)
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
run(f"{S} bash -lc '{compose} up -d api web'", t=300)
run(f"{S} bash -lc '{compose} exec -T api npx prisma migrate deploy'", t=120)
run(f"{S} bash -lc '{compose} restart api web'", t=120)
code, out = run("curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/login")
print("WEB LOGIN HTTP:", out.strip())
code2, out2 = run("curl -sf http://127.0.0.1:13000/api/kpi/ai-status")
print("AI STATUS:", out2.strip()[:200])
code3, out3 = run("curl -sf http://127.0.0.1:13000/api/positions -H 'Authorization: Bearer dummy' 2>/dev/null || echo need-auth")
sftp.close()
c.close()
print("DEPLOY DONE")
