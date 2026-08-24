import paramiko
import sys
import json
import time

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


def run(cmd, t=120):
    _, o, e = c.exec_command(cmd, timeout=t)
    o.channel.recv_exit_status()
    return o.read().decode(errors="replace")


print(run(f"{S} bash -lc '{compose} ps'"))
for i in range(10):
    code = run("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/login")
    print("login", code.strip())
    if code.strip() == "200":
        break
    time.sleep(3)

login = json.loads(
    run(
        "curl -s -X POST http://127.0.0.1:13000/api/auth/login "
        "-H 'Content-Type: application/json' "
        "-d '{\"email\":\"super@klinikpi.uz\",\"password\":\"klinikpi123\"}'"
    )
)
token = login["accessToken"]
parents = json.loads(
    run(
        f"curl -s 'http://127.0.0.1:13000/api/manager-kpi/catalog-parents?frequency=WEEKLY' "
        f"-H 'Authorization: Bearer {token}'"
    )
)
print("parents", len(parents), "first", parents[0]["key"] if parents else None, "subs", len(parents[0]["subs"]) if parents else 0)
parent = parents[0]["subs"][0]["key"] if parents and parents[0]["subs"] else parents[0]["key"]
created = json.loads(
    run(
        "curl -s -X POST http://127.0.0.1:13000/api/manager-kpi/catalog-task "
        f"-H 'Authorization: Bearer {token}' -H 'Content-Type: application/json' "
        f"-d '{{\"titleUz\":\"Test yangi vazifa\",\"descriptionUz\":\"Maqsad tekshiruv\",\"frequency\":\"WEEKLY\",\"parentKey\":\"{parent}\",\"proofRequired\":false}}'"
    )
)
print("created", json.dumps(created, ensure_ascii=False)[:400])
day = json.loads(
    run(
        f"curl -s 'http://127.0.0.1:13000/api/manager-kpi/day?branchId=branch-main&date=2026-07-22&frequency=WEEKLY' "
        f"-H 'Authorization: Bearer {token}'"
    )
)
key = created.get("node", {}).get("key")
found = []

def walk(nodes):
    for n in nodes or []:
        if n.get("key") == key:
            found.append(n.get("titleUz"))
        walk(n.get("children"))

walk(day.get("tree"))
print("in tree", found, "key", key)
c.close()
