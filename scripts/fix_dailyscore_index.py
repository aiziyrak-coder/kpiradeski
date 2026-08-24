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

sql = 'DROP INDEX IF EXISTS \\"DailyScore_date_key\\";'
cmd = (
    f"echo '{P}' | sudo -S bash -lc "
    f"\"{compose} exec -T db psql -U klinikpi -d klinikpi -c '{sql}'\""
)
print(cmd)
_, o, e = c.exec_command(cmd, timeout=60)
print(o.read().decode(errors="replace"))
print(e.read().decode(errors="replace")[-500:])
c.close()
