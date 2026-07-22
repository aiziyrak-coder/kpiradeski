"""Reset password for EXISTING users only. Never creates demo managers."""
import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
HASH = "$2b$12$8nbXHfH7RPy8cmjijm6lTuaWGA9Ymj/vwmfRbAfBJie6/3NUp3tl."
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)

SQL = f"""
UPDATE "User"
SET "passwordHash" = '{HASH}',
    active = true,
    "tokenVersion" = "tokenVersion" + 1
WHERE email = 'super@klinikpi.uz';

SELECT email, role, active FROM "User" ORDER BY email;
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)
sftp = c.open_sftp()
with sftp.file("/tmp/pw_admin_only.sql", "w") as f:
    f.write(SQL.replace("\r\n", "\n"))
sftp.close()


def run(cmd, t=120):
    full = f"echo '{P}' | sudo -S bash -lc {repr(cmd)}"
    _, o, e = c.exec_command(full, timeout=t)
    o.channel.recv_exit_status()
    print(o.read().decode(errors="replace")[-1500:])


run(f"{compose} cp /tmp/pw_admin_only.sql db:/tmp/pw_admin_only.sql")
run(f"{compose} exec -T db psql -U klinikpi -d klinikpi -f /tmp/pw_admin_only.sql")
c.close()
print("ADMIN PASSWORD RESET ONLY — no managers created")
