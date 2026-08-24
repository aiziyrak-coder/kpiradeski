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
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username='admin_root', password=P, timeout=30)
cmds = [
    "curl -sf https://kpi.devflix.uz/api/health",
    "curl -sf -X POST https://kpi.devflix.uz/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"super@klinikpi.uz\",\"password\":\"klinikpi123\"}' | python3 -c \"import sys,json; d=json.load(sys.stdin); print('login ok', d.get('user',{}).get('email'))\"",
    f"echo _deploy_password() | sudo -S docker ps --filter name=ishifo-web --format '{{{{.Names}}}} {{{{.Status}}}}'",
    "ls /etc/nginx/sites-enabled/",
]
for cmd in cmds:
    print('===', cmd[:90])
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode(errors='replace'))
    err = e.read().decode(errors='replace').strip()
    if err: print('ERR:', err[:200])
c.close()
