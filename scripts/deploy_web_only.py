"""Sync and rebuild web only."""
import os as _os


def _deploy_password() -> str:
    """Deploy paroli — faqat env orqali.

    Ilgari bu yerda parol ochiq yozilgan edi va repo ommaviy. Kalitni kodga
    qaytarmang: `DEPLOY_SSH_PASSWORD` (yoki `KPI_DEPLOY_PASS`) ni oʻrnating.
    """
    pw = _os.environ.get("DEPLOY_SSH_PASSWORD") or _os.environ.get("KPI_DEPLOY_PASS")
    if not pw:
        raise SystemExit(
            "DEPLOY_SSH_PASSWORD oʻrnatilmagan. "
            "PowerShell: $env:DEPLOY_SSH_PASSWORD='...'  |  bash: export DEPLOY_SSH_PASSWORD='...'"
        )
    return pw

import paramiko
import sys
import tarfile
import tempfile
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
ROOT = Path(__file__).resolve().parents[1]
EXCLUDE = {"node_modules", ".next", "dist", ".git", "uploads", "__pycache__", "scripts"}

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.0.101", port=22, username="admin_root", password=P, timeout=30)
sftp = c.open_sftp()

tmp = Path(tempfile.gettempdir()) / "kpiradeski-web-sync.tar.gz"
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
sftp.close()


def run(cmd, t=1200):
    print("$", cmd[:140])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out[-2000:])
    err = "\n".join(ln for ln in err.splitlines() if "password for" not in ln.lower())
    if err.strip() and code != 0:
        print("ERR", err[-1200:])
    return code

run(f"cp {APP}/.env /home/admin_root/klinikpi.env.bak")
run(
    f"tar -xzf /home/admin_root/kpiradeski-sync.tar.gz -C /tmp && "
    f"rsync -a --exclude=.env /tmp/kpiradeski/ {APP}/ && "
    f"cp /home/admin_root/klinikpi.env.bak {APP}/.env && "
    f"rm -rf /tmp/kpiradeski /home/admin_root/kpiradeski-sync.tar.gz"
)
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)
code = run(f"{S} bash -lc '{compose} build web --no-cache'", t=1800)
if code != 0:
    print("WEB BUILD FAILED", code)
    c.close()
    raise SystemExit(1)
run(f"{S} bash -lc '{compose} up -d web'")
time.sleep(10)
run(f"{S} bash -lc '{compose} ps'")
c.close()
print("WEB DEPLOY DONE")
