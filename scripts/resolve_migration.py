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

def run(inner):
    cmd = f"echo '{P}' | sudo -S bash -lc {inner!r}"
    print(">", inner[:120])
    _, o, e = c.exec_command(cmd, timeout=180)
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    print(out[-2500:])
    if err.strip():
        print("ERR", err[-800:])
    return out

# Get failure logs
run(
    f"{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"SELECT left(logs, 2000) FROM _prisma_migrations WHERE migration_name = '20260721193000_fix_dailyscore_unique_date';\""
)

# Check indexes with proper quotes
run(
    f"{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"SELECT indexname FROM pg_indexes WHERE tablename = 'DailyScore';\""
)

# Check daily scores
run(
    f"{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"SELECT id, \\\"branchId\\\", date FROM \\\"DailyScore\\\" ORDER BY date DESC LIMIT 10;\""
)

# Mark failed migration as applied (index already dropped manually)
run(
    f"{compose} exec -T api npx prisma migrate resolve --applied 20260721193000_fix_dailyscore_unique_date"
)

# Restart api+web
run(f"{compose} up -d api web")

c.close()
print("DONE")
