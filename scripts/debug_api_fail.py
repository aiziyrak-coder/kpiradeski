import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)
S = f"echo '{P}' | sudo -S bash -lc"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)

cmds = [
    f"{S} '{compose} logs api --tail 80'",
    f"{S} '{compose} exec -T db psql -U klinikpi -d klinikpi -c \"SELECT migration_name, finished_at, rolled_back_at, logs FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;\"'",
    f"{S} '{compose} exec -T db psql -U klinikpi -d klinikpi -c \"SELECT indexname FROM pg_indexes WHERE tablename = \\\"DailyScore\\\";\"'",
]

for cmd in cmds:
    print("===", cmd[:100])
    _, o, e = c.exec_command(cmd, timeout=120)
    print(o.read().decode(errors="replace")[-3000:])
    err = e.read().decode(errors="replace")
    if err.strip():
        print("ERR", err[-600:])

c.close()
