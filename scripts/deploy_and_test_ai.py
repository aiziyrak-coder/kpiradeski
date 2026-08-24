"""Deploy latest web + verify AI on production."""
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
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username="admin_root", password=P, timeout=30)


def run(cmd, t=600):
    print("$", cmd[:140])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out[-2500:] if len(out) > 2500 else out)
    if err.strip() and code != 0:
        print("ERR:", err[-800:])
    return code, out


# git pull if repo
code, out = run(f"test -d {APP}/.git && echo GIT || echo NOGIT")
if "GIT" in out:
    run(f"cd {APP} && git pull origin main")
else:
    run(f"cd {APP} && git clone https://github.com/aiziyrak-coder/kpiradeski.git /tmp/kpiradeski-new 2>/dev/null || (cd /tmp/kpiradeski-new && git pull)")
    run(f"cp -a /tmp/kpiradeski-new/. {APP}/ 2>/dev/null; test -f {APP}/.env || true")

compose = (
    f"{S} bash -lc 'cd {APP} && docker compose "
    f"-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml "
    f"build web --no-cache && docker compose "
    f"-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml up -d web'"
)
run(compose, t=1800)

for _ in range(24):
    code, out = run("curl -sf http://127.0.0.1:13000/login -o /dev/null -w '%{http_code}'")
    if "200" in out:
        print("Web OK")
        break
    time.sleep(10)

# AI check
run("curl -sf https://kpi.devflix.uz/api/health")
code, login_out = run(
    "curl -sf -X POST https://kpi.devflix.uz/api/auth/login "
    "-H 'Content-Type: application/json' "
    "-d '{\"email\":\"super@klinikpi.uz\",\"password\":\"klinikpi123\"}'"
)
if code == 0 and "accessToken" in login_out:
    import json
    token = json.loads(login_out)["accessToken"]
    run(f"curl -sf https://kpi.devflix.uz/api/kpi/ai-status -H 'Authorization: Bearer {token}'")
    run(
        f"curl -sf -X POST https://kpi.devflix.uz/api/staff/ai-daily "
        f"-H 'Authorization: Bearer {token}' -H 'Content-Type: application/json'"
    )
else:
    print("Login failed for AI test")

c.close()
print("DONE")
