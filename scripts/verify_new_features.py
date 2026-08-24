import json
import urllib.request
from datetime import date

base = "https://kpi.devflix.uz"

def login(email):
    req = urllib.request.Request(
        base + "/api/auth/login",
        data=json.dumps({"email": email, "password": "klinikpi123"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    d = json.loads(urllib.request.urlopen(req).read().decode())
    return d.get("accessToken") or d.get("access_token") or d.get("token")

mt = login("manager@klinikpi.uz")
mh = {"Authorization": "Bearer " + mt}
branches = json.loads(
    urllib.request.urlopen(urllib.request.Request(base + "/api/branches/mine", headers=mh)).read().decode()
)
bid = branches[0]["id"]
d = date.today().isoformat()
day = json.loads(
    urllib.request.urlopen(
        urllib.request.Request(
            base + f"/api/manager-kpi/day?branchId={bid}&date={d}&frequency=DAILY",
            headers=mh,
        )
    ).read().decode()
)
tree = day.get("tree") or []
print("tree roots", len(tree), "children0", len(tree[0].get("children") or []) if tree else 0)

# toggle checkbox
key = tree[0]["key"] if tree else "ads_tv"
body = json.dumps({"branchId": bid, "date": d, "nodeKey": key, "value": True, "done": True}).encode()
r = urllib.request.urlopen(
    urllib.request.Request(
        base + "/api/manager-kpi/entry",
        data=body,
        headers={**mh, "Content-Type": "application/json"},
        method="POST",
    )
)
print("toggle", r.status)

# AI report
q = f"period=DAY&from={d}&branchId={bid}"
req = urllib.request.Request(
    base + f"/api/kpi/ai-reports/KPI?{q}",
    data=b"",
    headers=mh,
    method="POST",
)
try:
    rep = json.loads(urllib.request.urlopen(req, timeout=90).read().decode())
    print("ai report", rep.get("period"), (rep.get("content") or "")[:80].replace("\n", " "))
except Exception as e:
    print("ai fail", getattr(e, "code", None), e.read().decode()[:300] if hasattr(e, "read") else e)

print("login page", urllib.request.urlopen(base + "/login").status)
print("OK")
