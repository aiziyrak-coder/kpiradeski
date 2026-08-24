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
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username="admin_root", password=P, timeout=30)


def run(cmd, t=60):
    _, o, e = c.exec_command(cmd, timeout=t)
    o.channel.recv_exit_status()
    return o.read().decode(errors="replace")


login = json.loads(
    run(
        "curl -s -X POST http://127.0.0.1:13000/api/auth/login "
        "-H 'Content-Type: application/json' "
        "-d '{\"email\":\"manager@radeski.uz\",\"password\":\"klinikpi123\"}'"
    )
)
token = login["accessToken"]
day = json.loads(
    run(
        f"curl -s 'http://127.0.0.1:13000/api/manager-kpi/day?branchId=branch-main&date=2026-07-22&frequency=WEEKLY' "
        f"-H 'Authorization: Bearer {token}'"
    )
)
print("mode", day.get("mode"), "assigned", day.get("assignedCount"), "pending", len(day.get("pending") or []))
print("pending keys:", [r["key"] for r in (day.get("pending") or [])])
c.close()
