"""Sync latest source to server and rebuild web."""
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


def _deploy_host() -> str:
    """Server manzili — env bilan almashtiriladi.

    Ilgari bu yerda 87.192.230.208:2222 qatʼiy yozilgan edi va u endi
    javob bermaydi; server LAN ichida 192.168.0.101:22 da.
    """
    return _os.environ.get("DEPLOY_SSH_HOST", "192.168.0.101")


def _deploy_port() -> int:
    return int(_os.environ.get("DEPLOY_SSH_PORT", "22"))

import paramiko
import sys
import tarfile
import tempfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
ROOT = Path(__file__).resolve().parents[1]
EXCLUDE = {"node_modules", ".next", "dist", ".git", "uploads", "__pycache__"}

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username="admin_root", password=P, timeout=30)
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
    print("$", cmd[:120])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    if out.strip():
        print(out[-1500:])
    return code

run(f"cp {APP}/.env /home/admin_root/klinikpi.env.bak")
run(
    f"tar -xzf /home/admin_root/kpiradeski-sync.tar.gz -C /tmp && "
    f"rsync -a --exclude=.env /tmp/kpiradeski/ {APP}/ && "
    f"cp /home/admin_root/klinikpi.env.bak {APP}/.env && rm -rf /tmp/kpiradeski /home/admin_root/kpiradeski-sync.tar.gz"
)
run(
    f"{S} bash -lc 'cd {APP} && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml build web --no-cache && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml up -d web'",
    t=1800,
)
sftp.close()
c.close()
print("SYNC DONE")
