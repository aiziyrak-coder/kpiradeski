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
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username="admin_root", password=P, timeout=30)


def sudo(cmd: str, t=180):
    full = f"echo '{P}' | sudo -S bash -lc {repr(cmd)}"
    print(">", cmd[:140])
    _, o, e = c.exec_command(full, timeout=t)
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    print(out[-2000:] if out else "")
    # filter sudo password prompt noise
    err_lines = [ln for ln in err.splitlines() if "password for" not in ln.lower()]
    if err_lines:
        print("ERR", "\n".join(err_lines)[-1000:])
    return out


# Mark failed migration finished via SQL (index already dropped earlier)
sudo(
    f"{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"UPDATE _prisma_migrations SET finished_at = NOW(), logs = NULL, "
    "rolled_back_at = NULL, applied_steps_count = 1 "
    "WHERE migration_name = '20260721193000_fix_dailyscore_unique_date';\""
)

sudo(
    f"{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"SELECT migration_name, finished_at IS NOT NULL AS ok FROM _prisma_migrations "
    "WHERE migration_name LIKE '%fix_dailyscore%';\""
)

sudo(
    f"{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"SELECT indexname FROM pg_indexes WHERE tablename = 'DailyScore';\""
)

sudo(f"{compose} up -d --force-recreate api", t=120)
import time

time.sleep(12)
sudo(f"{compose} ps")
sudo(f"{compose} logs api --tail 50")

c.close()
print("DONE")
