"""Only reset admin password. Never recreate demo managers."""
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
import urllib.request
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
HASH = "$2b$12$8nbXHfH7RPy8cmjijm6lTuaWGA9Ymj/vwmfRbAfBJie6/3NUp3tl."
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)

SQL = f"""
-- Admin parolini yangilash (manager yaratilmaydi)
UPDATE "User"
SET "passwordHash" = '{HASH}',
    active = true,
    "tokenVersion" = "tokenVersion" + 1,
    "updatedAt" = NOW()
WHERE email = 'super@klinikpi.uz';

SELECT email, role, active FROM "User" ORDER BY email;
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username="admin_root", password=P, timeout=30)
sftp = c.open_sftp()
with sftp.file("/tmp/pw_reset.sql", "w") as f:
    f.write(SQL.replace("\r\n", "\n"))
sftp.close()


def run(cmd, t=120):
    full = f"echo '{P}' | sudo -S bash -lc {repr(cmd)}"
    _, o, e = c.exec_command(full, timeout=t)
    o.channel.recv_exit_status()
    print(o.read().decode(errors="replace")[-2000:])
    err = "\n".join(
        ln for ln in e.read().decode(errors="replace").splitlines() if "password for" not in ln.lower()
    )
    if err.strip():
        print("ERR", err[-400:])


run(f"{compose} cp /tmp/pw_reset.sql db:/tmp/pw_reset.sql")
run(f"{compose} exec -T db psql -U klinikpi -d klinikpi -f /tmp/pw_reset.sql")
c.close()

base = "https://kpi.devflix.uz"
try:
    req = urllib.request.Request(
        base + "/api/auth/login",
        data=json.dumps({"email": "super@klinikpi.uz", "password": "klinikpi123"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    d = json.loads(urllib.request.urlopen(req, timeout=20).read().decode())
    print("LOGIN OK", d["user"]["email"], d["user"]["role"])
except Exception as ex:
    print("LOGIN FAIL", getattr(ex, "code", ex))
