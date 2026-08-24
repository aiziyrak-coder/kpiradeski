import paramiko
import sys
import json

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)


def run(cmd, t=60):
    _, o, e = c.exec_command(cmd, timeout=t)
    o.channel.recv_exit_status()
    return o.read().decode(errors="replace")


login = json.loads(
    run(
        "curl -s -X POST http://127.0.0.1:13000/api/auth/login "
        "-H 'Content-Type: application/json' "
        "-d '{\"email\":\"manager@radeski.uz\",\"password\":\"klinikpi123\"}'"
    )
)
token = login["accessToken"]
day = json.loads(
    run(
        f"curl -s 'http://127.0.0.1:13000/api/manager-kpi/day?branchId=branch-main&date=2026-07-22&frequency=WEEKLY' "
        f"-H 'Authorization: Bearer {token}'"
    )
)
print("mode", day.get("mode"), "assigned", day.get("assignedCount"), "pending", len(day.get("pending") or []))
print("pending keys:", [r["key"] for r in (day.get("pending") or [])])
c.close()
