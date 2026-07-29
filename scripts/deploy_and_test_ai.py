"""Deploy latest web + verify AI on production."""
import paramiko
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)


def run(cmd, t=600):
    print("$", cmd[:140])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out[-2500:] if len(out) > 2500 else out)
    if err.strip() and code != 0:
        print("ERR:", err[-800:])
    return code, out


# git pull if repo
code, out = run(f"test -d {APP}/.git && echo GIT || echo NOGIT")
if "GIT" in out:
    run(f"cd {APP} && git pull origin main")
else:
    run(f"cd {APP} && git clone https://github.com/aiziyrak-coder/kpiradeski.git /tmp/kpiradeski-new 2>/dev/null || (cd /tmp/kpiradeski-new && git pull)")
    run(f"cp -a /tmp/kpiradeski-new/. {APP}/ 2>/dev/null; test -f {APP}/.env || true")

compose = (
    f"{S} bash -lc 'cd {APP} && docker compose "
    f"-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml "
    f"build web --no-cache && docker compose "
    f"-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml up -d web'"
)
run(compose, t=1800)

for _ in range(24):
    code, out = run("curl -sf http://127.0.0.1:13000/login -o /dev/null -w '%{http_code}'")
    if "200" in out:
        print("Web OK")
        break
    time.sleep(10)

# AI check
run("curl -sf https://kpi.devflix.uz/api/health")
code, login_out = run(
    "curl -sf -X POST https://kpi.devflix.uz/api/auth/login "
    "-H 'Content-Type: application/json' "
    "-d '{\"email\":\"super@klinikpi.uz\",\"password\":\"klinikpi123\"}'"
)
if code == 0 and "accessToken" in login_out:
    import json
    token = json.loads(login_out)["accessToken"]
    run(f"curl -sf https://kpi.devflix.uz/api/kpi/ai-status -H 'Authorization: Bearer {token}'")
    run(
        f"curl -sf -X POST https://kpi.devflix.uz/api/staff/ai-daily "
        f"-H 'Authorization: Bearer {token}' -H 'Content-Type: application/json'"
    )
else:
    print("Login failed for AI test")

c.close()
print("DONE")
