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
import json
import time
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username="admin_root", password=P, timeout=30)
S = f"echo '{P}' | sudo -S"
APP = "/home/admin_root/kpiradeski"
compose = f"cd {APP} && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml"

for i in range(12):
    _, o, _ = c.exec_command("curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/login", timeout=30)
    code = o.read().decode().strip()
    print("attempt", i + 1, "login", code)
    if code == "200":
        break
    time.sleep(10)

_, o, _ = c.exec_command(f"{S} bash -lc '{compose} ps'", timeout=60)
print(o.read().decode()[-1500:])

_, o, _ = c.exec_command("curl -sf http://127.0.0.1:13000/api/kpi/ai-status", timeout=30)
print("AI:", o.read().decode())

_, o, _ = c.exec_command(
    """curl -sf -X POST http://127.0.0.1:13000/api/auth/login """
    """-H 'Content-Type: application/json' """
    """-d '{"email":"super@klinikpi.uz","password":"klinikpi123"}'""",
    timeout=30,
)
login = o.read().decode()
print("LOGIN ok:", "accessToken" in login)
try:
    tok = json.loads(login)["accessToken"]
    _, o, _ = c.exec_command(
        f"curl -sf http://127.0.0.1:13000/api/positions -H 'Authorization: Bearer {tok}'",
        timeout=30,
    )
    pos = json.loads(o.read().decode())
    print("POSITIONS:", len(pos), "items")
    if pos:
        print("Sample:", pos[0].get("nameUz"), "/", pos[0].get("nameRu"))
except Exception as e:
    print("positions error:", e, login[:200])

c.close()
