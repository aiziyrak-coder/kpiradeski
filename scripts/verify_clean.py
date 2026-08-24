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
print("manager login", bool(token), (login.get("user") or {}).get("name"))
h = {"Authorization": "Bearer " + token}
branches = json.loads(
    urllib.request.urlopen(urllib.request.Request(base + "/api/branches/mine", headers=h)).read().decode()
)
print("branches", [(b["id"], b["name"]) for b in branches])
bid = branches[0]["id"]
d = date.today().isoformat()
day = json.loads(
    urllib.request.urlopen(
        urllib.request.Request(
            base + f"/api/manager-kpi/day?branchId={bid}&date={d}&frequency=DAILY",
            headers=h,
        )
    ).read().decode()
)
print("daily tasks", len(day.get("tasks") or []), "score", day.get("totalScore"), "entries", len(day.get("entries") or {}))

# admin
req = urllib.request.Request(
    base + "/api/auth/login",
    data=json.dumps({"email": "super@klinikpi.uz", "password": "klinikpi123"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
admin = json.loads(urllib.request.urlopen(req).read().decode())
ah = {"Authorization": "Bearer " + (admin.get("accessToken") or admin.get("access_token") or admin.get("token"))}
users = json.loads(urllib.request.urlopen(urllib.request.Request(base + "/api/users", headers=ah)).read().decode())
print("users", [(u["email"], u["role"]) for u in users])
print("OK")
