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

import paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
S = f"echo '{P}' | sudo -S"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username='admin_root', password=P, timeout=30)
cmds = [
    f"{S} docker ps --filter name=klinikpi --format 'table {{{{.Names}}}}\t{{{{.Status}}}}\t{{{{.Ports}}}}'",
    "curl -sf http://127.0.0.1:13000/api/health",
    "curl -sf -X POST http://127.0.0.1:13000/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"super@klinikpi.uz\",\"password\":\"klinikpi123\"}' | head -c 200",
    f"grep -r 'kpi.devflix' /etc/nginx/sites-enabled/",
    f"{S} docker ps --filter name=ishifo --format '{{{{.Names}}}}' | wc -l",
]
for cmd in cmds:
    print('===', cmd[:90])
    _, o, _ = c.exec_command(cmd, timeout=30)
    print(o.read().decode(errors='replace'))
c.close()
