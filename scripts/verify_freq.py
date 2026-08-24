import json
import urllib.request
from datetime import date

base = "https://kpi.devflix.uz"
print("login page", urllib.request.urlopen(base + "/login", timeout=30).status)

req = urllib.request.Request(
    base + "/api/auth/login",
    data=json.dumps({"email": "manager@klinikpi.uz", "password": "klinikpi123"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
login = json.loads(urllib.request.urlopen(req).read().decode())
token = login.get("accessToken") or login.get("access_token") or login.get("token")
h = {"Authorization": "Bearer " + token}
branches = json.loads(
    urllib.request.urlopen(urllib.request.Request(base + "/api/branches/mine", headers=h)).read().decode()
)
bid = branches[0]["id"]
d = date.today().isoformat()
for freq in ("DAILY", "WEEKLY", "MONTHLY"):
    day = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                base + f"/api/manager-kpi/day?branchId={bid}&date={d}&frequency={freq}",
                headers=h,
            )
        ).read().decode()
    )
    print(freq, "tasks", len(day.get("tasks") or day.get("columns") or []), "score", day.get("totalScore"))
print("OK")
