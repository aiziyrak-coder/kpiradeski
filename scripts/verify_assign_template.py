import paramiko
import sys
import json

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
    print("$", cmd[:200])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out[-3000:])
    if err.strip() and "password" not in err.lower():
        print("ERR:", err[-1000:])
    return out


run(
    f"{S} bash -lc '{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at;\"'"
)
run(
    f"{S} bash -lc '{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"\\\\dt \\\"KpiAssignmentTemplate\\\"\"'"
)
run(
    f"{S} bash -lc '{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"SELECT COUNT(*) AS templates FROM \\\"KpiAssignmentTemplate\\\";\"'"
)

# Login admin and assign weekly tasks, then reload day and check assigned
login = run(
    "curl -s -X POST http://127.0.0.1:13000/api/auth/login "
    "-H 'Content-Type: application/json' "
    "-d '{\"email\":\"super@klinikpi.uz\",\"password\":\"klinikpi123\"}'"
)
print("LOGIN RAW:", login[:400])
try:
    token = json.loads(login)["accessToken"]
except Exception as ex:
    print("login parse fail", ex)
    c.close()
    sys.exit(1)

branches = run(
    f"curl -s http://127.0.0.1:13000/api/branches/mine -H 'Authorization: Bearer {token}'"
)
print("BRANCHES:", branches[:500])
bid = json.loads(branches)[0]["id"]

day = run(
    f"curl -s 'http://127.0.0.1:13000/api/manager-kpi/day?branchId={bid}&date=2026-07-22&frequency=WEEKLY' "
    f"-H 'Authorization: Bearer {token}'"
)
d = json.loads(day)
print("assignedCount before:", d.get("assignedCount"), "mode:", d.get("mode"))

# collect a few leaf keys from tree
keys = []

def walk(nodes):
    for n in nodes or []:
        if n.get("inputType") != "GROUP" and not n.get("children"):
            keys.append(n["key"])
        walk(n.get("children"))

walk(d.get("tree"))
print("sample keys", keys[:5], "total leaves visible", len(keys))
sel = keys[:8] if keys else []

assign = run(
    "curl -s -X POST http://127.0.0.1:13000/api/manager-kpi/assign "
    "-H 'Authorization: Bearer " + token + "' "
    "-H 'Content-Type: application/json' "
    f"-d '{{\"branchId\":\"{bid}\",\"date\":\"2026-07-22\",\"frequency\":\"WEEKLY\",\"nodeKeys\":{json.dumps(sel)}}}'"
)
print("ASSIGN:", assign[:400])

day2 = run(
    f"curl -s 'http://127.0.0.1:13000/api/manager-kpi/day?branchId={bid}&date=2026-07-22&frequency=WEEKLY' "
    f"-H 'Authorization: Bearer {token}'"
)
d2 = json.loads(day2)
print("assignedCount after:", d2.get("assignedCount"))
# check assigned flags in tree
assigned_flags = []

def walk2(nodes):
    for n in nodes or []:
        if n.get("key") in sel:
            assigned_flags.append((n["key"], n.get("assigned")))
        walk2(n.get("children"))

walk2(d2.get("tree"))
print("flags for selected:", assigned_flags)

# different date same week - should still show
day3 = run(
    f"curl -s 'http://127.0.0.1:13000/api/manager-kpi/day?branchId={bid}&date=2026-07-25&frequency=WEEKLY' "
    f"-H 'Authorization: Bearer {token}'"
)
d3 = json.loads(day3)
print("assignedCount other day same week:", d3.get("assignedCount"))

run(
    f"{S} bash -lc '{compose} exec -T db psql -U klinikpi -d klinikpi -c "
    "\"SELECT frequency, COUNT(*) FROM \\\"KpiAssignmentTemplate\\\" WHERE active GROUP BY frequency;\"'"
)
c.close()
print("VERIFY DONE")
