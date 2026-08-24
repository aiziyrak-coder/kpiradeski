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

sql = """UPDATE "_prisma_migrations"
SET finished_at = NOW(),
    logs = NULL,
    rolled_back_at = NULL,
    applied_steps_count = 1
WHERE migration_name = '20260721193000_fix_dailyscore_unique_date';

SELECT migration_name, finished_at IS NOT NULL AS ok
FROM "_prisma_migrations"
WHERE migration_name = '20260721193000_fix_dailyscore_unique_date';

DROP INDEX IF EXISTS "DailyScore_date_key";

SELECT indexname FROM pg_indexes WHERE tablename = 'DailyScore';
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username="admin_root", password=P, timeout=30)
sftp = c.open_sftp()
with sftp.file("/tmp/fix_mig.sql", "w") as f:
    f.write(sql.replace("\r\n", "\n"))
sftp.close()

def run(cmd, t=180):
    print(">", cmd[:160])
    _, o, e = c.exec_command(cmd, timeout=t)
    print(o.read().decode(errors="replace")[-2500:])
    err = e.read().decode(errors="replace")
    err = "\n".join(ln for ln in err.splitlines() if "password for" not in ln.lower())
    if err.strip():
        print("ERR", err[-1000:])

# copy sql into db container and run
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)
run(f"echo '{P}' | sudo -S bash -lc '{compose} cp /tmp/fix_mig.sql db:/tmp/fix_mig.sql'")
run(
    f"echo '{P}' | sudo -S bash -lc "
    f"'{compose} exec -T db psql -U klinikpi -d klinikpi -f /tmp/fix_mig.sql'"
)
run(f"echo '{P}' | sudo -S bash -lc '{compose} up -d --force-recreate api'")
time.sleep(15)
run(f"echo '{P}' | sudo -S bash -lc '{compose} ps'")
run(f"echo '{P}' | sudo -S bash -lc '{compose} logs api --tail 30'")
c.close()
