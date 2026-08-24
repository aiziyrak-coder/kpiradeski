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

import paramiko, sys, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username='admin_root', password=P, timeout=30)

def run(cmd, t=600):
    print('$', cmd[:120])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors='replace')
    if out.strip(): print(out)
    err = e.read().decode(errors='replace').strip()
    if err and code != 0: print('ERR:', err)
    return code

compose = f"{S} bash -lc 'cd {APP} && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml"
run(f"{compose} down -v'")
run(f"{compose} up -d --build'", t=1800)
print('Waiting...')
for i in range(40):
    _, o, _ = c.exec_command("curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/login", timeout=30)
    if '200' in o.read().decode(): print('WEB OK'); break
    time.sleep(10)
else:
    run(f"{S} docker logs klinikpi-api --tail 40")
c.close()
