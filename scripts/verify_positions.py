import paramiko
import json
import time
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)
S = f"echo '{P}' | sudo -S"
APP = "/home/admin_root/kpiradeski"
compose = f"cd {APP} && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml"

for i in range(12):
    _, o, _ = c.exec_command("curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/login", timeout=30)
    code = o.read().decode().strip()
    print("attempt", i + 1, "login", code)
    if code == "200":
        break
    time.sleep(10)

_, o, _ = c.exec_command(f"{S} bash -lc '{compose} ps'", timeout=60)
print(o.read().decode()[-1500:])

_, o, _ = c.exec_command("curl -sf http://127.0.0.1:13000/api/kpi/ai-status", timeout=30)
print("AI:", o.read().decode())

_, o, _ = c.exec_command(
    """curl -sf -X POST http://127.0.0.1:13000/api/auth/login """
    """-H 'Content-Type: application/json' """
    """-d '{"email":"super@klinikpi.uz","password":"klinikpi123"}'""",
    timeout=30,
)
login = o.read().decode()
print("LOGIN ok:", "accessToken" in login)
try:
    tok = json.loads(login)["accessToken"]
    _, o, _ = c.exec_command(
        f"curl -sf http://127.0.0.1:13000/api/positions -H 'Authorization: Bearer {tok}'",
        timeout=30,
    )
    pos = json.loads(o.read().decode())
    print("POSITIONS:", len(pos), "items")
    if pos:
        print("Sample:", pos[0].get("nameUz"), "/", pos[0].get("nameRu"))
except Exception as e:
    print("positions error:", e, login[:200])

c.close()
