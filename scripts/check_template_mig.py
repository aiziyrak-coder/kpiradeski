import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)
S = f"echo '{P}' | sudo -S"
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)


def run(cmd, t=180):
    print("$", cmd[:180])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out[-4000:])
    if err.strip():
        print("ERR:", err[-2000:])
    print("exit", code)
    return code, out


run(f"ls -la {APP}/apps/api/prisma/migrations/ | tail -25")
run(f"ls -la {APP}/apps/api/prisma/migrations/20260722120000_kpi_assignment_template/ 2>&1")
run(f"{S} bash -lc '{compose} ps'")
run(f"{S} bash -lc '{compose} exec -T api ls prisma/migrations | tail -25'")
run(f"{S} bash -lc '{compose} exec -T api npx prisma migrate status'")
run(f"{S} bash -lc '{compose} restart api web'")
run("sleep 12; curl -s -o /dev/null -w 'login:%{http_code}\\n' http://127.0.0.1:13000/login")
run("curl -s http://127.0.0.1:13000/api/kpi/ai-status | head -c 300; echo")
c.close()
print("OK")
