import json
import urllib.request
from datetime import date

base = "https://kpi.devflix.uz"
req = urllib.request.Request(
    base + "/api/auth/login",
    data=json.dumps({"email": "manager@klinikpi.uz", "password": "klinikpi123"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
login = json.loads(urllib.request.urlopen(req).read().decode())
token = login.get("accessToken") or login.get("access_token") or login.get("token")
mh = {"Authorization": "Bearer " + token}
branches = json.loads(
    urllib.request.urlopen(urllib.request.Request(base + "/api/branches/mine", headers=mh)).read().decode()
)
bid = branches[0]["id"]
d = date.today().isoformat()

body = json.dumps({"branchId": bid, "date": d, "nodeKey": "ads_tv", "value": True, "done": True}).encode()
r = urllib.request.urlopen(
    urllib.request.Request(
        base + "/api/manager-kpi/entry",
        data=body,
        headers={**mh, "Content-Type": "application/json"},
        method="POST",
    )
)
print("checkbox", r.status)

body = json.dumps(
    {
        "branchId": bid,
        "date": d,
        "nodeKey": "clinic.cleanliness.floors.wash",
        "value": True,
        "done": True,
    }
).encode()
r = urllib.request.urlopen(
    urllib.request.Request(
        base + "/api/manager-kpi/entry",
        data=body,
        headers={**mh, "Content-Type": "application/json"},
        method="POST",
    )
)
print("nested", r.status)

png = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)
boundary = "----bound123"
parts = []


def add(name, val, filename=None, ctype=None):
    parts.append(f"--{boundary}".encode())
    if filename:
        parts.append(f'Content-Disposition: form-data; name="{name}"; filename="{filename}"'.encode())
        parts.append(f"Content-Type: {ctype}".encode())
        parts.append(b"")
        parts.append(val)
    else:
        parts.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        parts.append(b"")
        parts.append(val if isinstance(val, bytes) else str(val).encode())


add("branchId", bid)
add("nodeKey", "ads_tv")
add("date", d)
add("file", png, "proof.png", "image/png")
parts.append(f"--{boundary}--".encode())
parts.append(b"")
data = b"\r\n".join(parts)
req = urllib.request.Request(
    base + "/api/manager-kpi/proof",
    data=data,
    headers={**mh, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    method="POST",
)
try:
    r = urllib.request.urlopen(req, timeout=90)
    proof = json.loads(r.read().decode())
    status = proof.get("aiStatus") or (proof.get("proof") or {}).get("aiStatus")
    note = proof.get("aiNote") or (proof.get("proof") or {}).get("aiNote") or ""
    print("proof", r.status, status, str(note)[:100])
except Exception as e:
    body = e.read().decode()[:400] if hasattr(e, "read") else str(e)
    print("proof fail", getattr(e, "code", None), body)

day = json.loads(
    urllib.request.urlopen(
        urllib.request.Request(base + f"/api/manager-kpi/day?branchId={bid}&date={d}", headers=mh)
    ).read().decode()
)
print("day score", day["totalScore"], "completion", day.get("completion"))
print("VERIFY OK")
