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

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username="admin_root", password=P, timeout=30)
S = f"echo '{P}' | sudo -S"
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)


def run(cmd, t=180):
    print("$", cmd[:180])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out[-4000:])
    if err.strip():
        print("ERR:", err[-2000:])
    print("exit", code)
    return code, out


run(f"ls -la {APP}/apps/api/prisma/migrations/ | tail -25")
run(f"ls -la {APP}/apps/api/prisma/migrations/20260722120000_kpi_assignment_template/ 2>&1")
run(f"{S} bash -lc '{compose} ps'")
run(f"{S} bash -lc '{compose} exec -T api ls prisma/migrations | tail -25'")
run(f"{S} bash -lc '{compose} exec -T api npx prisma migrate status'")
run(f"{S} bash -lc '{compose} restart api web'")
run("sleep 12; curl -s -o /dev/null -w 'login:%{http_code}\\n' http://127.0.0.1:13000/login")
run("curl -s http://127.0.0.1:13000/api/kpi/ai-status | head -c 300; echo")
c.close()
print("OK")
