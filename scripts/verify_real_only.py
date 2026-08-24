"""Smoke: no phantom scores/audit/misses before real work."""
import json
import sys
import urllib.request
from datetime import date

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
base = "https://kpi.devflix.uz"

req = urllib.request.Request(
    base + "/api/auth/login",
    data=json.dumps({"email": "super@klinikpi.uz", "password": "klinikpi123"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
admin = json.loads(urllib.request.urlopen(req, timeout=30).read().decode())
token = admin.get("accessToken") or admin.get("access_token") or admin.get("token")
h = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}

branches = json.loads(
    urllib.request.urlopen(
        urllib.request.Request(base + "/api/branches/mine", headers=h)
    ).read().decode()
)
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
print("day", {"score": day.get("totalScore"), "assigned": day.get("assignedCount")})

an = json.loads(
    urllib.request.urlopen(
        urllib.request.Request(
            base + f"/api/reports/analytics?from=2026-07-01&to={d}&frequency=DAILY",
            headers=h,
        )
    ).read().decode()
)
print(
    "analytics",
    {
        "incomplete": len(an.get("incompleteTasks") or []),
        "daysTracked": an.get("summary", {}).get("daysTracked"),
        "avgScore": an.get("summary", {}).get("avgScore"),
    },
)

au = json.loads(
    urllib.request.urlopen(
        urllib.request.Request(
            base + "/api/settings/integrations/ai-audit",
            data=b"{}",
            headers=h,
            method="POST",
        )
    ).read().decode()
)
print(
    "audit",
    {
        "score": au.get("score"),
        "ops": au.get("hasOperationalData"),
        "items": len(au.get("items") or []),
    },
)

ok = (
    day.get("totalScore") == 0
    and len(an.get("incompleteTasks") or []) == 0
    and (an.get("summary") or {}).get("daysTracked") == 0
    and au.get("score") == 0
    and au.get("hasOperationalData") is False
    and len(au.get("items") or []) == 0
)
print("REAL_ONLY_OK" if ok else "REAL_ONLY_FAIL")
sys.exit(0 if ok else 1)
