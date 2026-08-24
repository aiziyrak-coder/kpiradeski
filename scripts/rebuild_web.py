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

import paramiko, sys, tarfile, tempfile
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
ROOT = Path(__file__).resolve().parents[1]
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username='admin_root', password=P, timeout=30)
sftp = c.open_sftp()

# upload changed files only
for rel in ["apps/web/Dockerfile", "docker-compose.yml"]:
    local = ROOT / rel
    remote = f"{APP}/{rel.replace(chr(92), '/')}"
    sftp.put(str(local), remote)
    print("uploaded", rel)

compose = f"{S} bash -lc 'cd {APP} && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml build web --no-cache && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml up -d web'"
print('rebuilding web...')
_, o, e = c.exec_command(compose, timeout=1800)
print(o.read().decode(errors='replace')[-3000:])
print(e.read().decode(errors='replace')[-1000:])

import time
for _ in range(30):
    _, o, _ = c.exec_command("curl -sf http://127.0.0.1:13000/api/health", timeout=20)
    out = o.read().decode()
    if 'ok' in out:
        print('HEALTH OK:', out)
        break
    time.sleep(10)
else:
    _, o, _ = c.exec_command(f"{S} docker logs klinikpi-web --tail 20", timeout=30)
    print(o.read().decode())

sftp.close()
c.close()
