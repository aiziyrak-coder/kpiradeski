import paramiko
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
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
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)
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
