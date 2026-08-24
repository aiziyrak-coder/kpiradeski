import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)


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
