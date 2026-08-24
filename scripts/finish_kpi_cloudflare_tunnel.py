"""
Finalize Cloudflare Tunnel after you open the login URL and authorize.

Usage (on your PC after Cloudflare login in browser):
  python scripts/finish_kpi_cloudflare_tunnel.py

Requires: cloudflared tunnel login already completed on server
  (cert at /root/.cloudflared/cert.pem)
"""
import os as _os


def _deploy_password() -> str:
    """Deploy paroli — faqat env orqali.

    Ilgari bu yerda parol ochiq yozilgan edi va repo ommaviy. Kalitni kodga
    qaytarmang: `DEPLOY_SSH_PASSWORD` (yoki `KPI_DEPLOY_PASS`) ni oʻrnating.
    """
    pw = _os.environ.get("DEPLOY_SSH_PASSWORD") or _os.environ.get("KPI_DEPLOY_PASS")
    if not pw:
        raise SystemExit(
            "DEPLOY_SSH_PASSWORD oʻrnatilmagan. "
            "PowerShell: $env:DEPLOY_SSH_PASSWORD='...'  |  bash: export DEPLOY_SSH_PASSWORD='...'"
        )
    return pw

import sys
import re
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
HOST = "192.168.0.101"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, port=22, username="admin_root", password=P, timeout=30)


def run(cmd, t=120):
    print("$", cmd[:130])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    err = "\n".join(ln for ln in err.splitlines() if "password for" not in ln.lower())
    if out.strip():
        print(out[-2500:])
    if err.strip() and code != 0:
        print("ERR", err[-800:])
    return code, out


code, out = run(
    f"echo '{P}' | sudo -S bash -lc 'test -f /root/.cloudflared/cert.pem && echo HAS_CERT || echo NO_CERT'"
)
if "NO_CERT" in out:
    print(
        "\nAvval Cloudflare login qiling. Serverda URL ochilgan edi.\n"
        "Yoki qayta ishga tushiring:\n"
        "  sudo cloudflared tunnel login\n"
    )
    c.close()
    raise SystemExit(1)

# Create tunnel if missing
code, out = run(
    f"echo '{P}' | sudo -S bash -lc '"
    "cloudflared tunnel list 2>/dev/null | grep -i kpi-radeski || "
    "cloudflared tunnel create kpi-radeski'"
)

code, out = run(
    f"echo '{P}' | sudo -S bash -lc 'cloudflared tunnel list'"
)
m = re.search(r"([0-9a-f-]{36})\s+kpi-radeski", out)
if not m:
    # try parse create output / list differently
    m = re.search(r"Created tunnel.*?([0-9a-f-]{36})", out)
if not m:
    code, out2 = run(
        f"echo '{P}' | sudo -S bash -lc 'ls /root/.cloudflared/*.json 2>/dev/null'"
    )
    m = re.search(r"([0-9a-f-]{36})\.json", out2)
if not m:
    print("Tunnel UUID topilmadi — qoʻlda tekshiring: sudo cloudflared tunnel list")
    c.close()
    raise SystemExit(1)

tid = m.group(1)
print("TUNNEL_ID", tid)

yml = f"""tunnel: {tid}
credentials-file: /root/.cloudflared/{tid}.json

ingress:
  - hostname: kpi.devflix.uz
    service: http://127.0.0.1:13000
  - service: http_status:404
"""
sftp = c.open_sftp()
with sftp.file("/tmp/cf-config.yml", "w") as f:
    f.write(yml)
sftp.close()

run(
    f"echo '{P}' | sudo -S bash -lc '"
    "cp /tmp/cf-config.yml /etc/cloudflared/config.yml; "
    "cloudflared tunnel route dns kpi-radeski kpi.devflix.uz 2>&1 || true; "
    "systemctl enable cloudflared-kpi; "
    "systemctl restart cloudflared-kpi; "
    "sleep 2; systemctl is-active cloudflared-kpi; "
    "cloudflared tunnel info kpi-radeski 2>&1 | head -20'"
)

print(
    f"""
=== DNS (ahost.uz panel) ===
Agar Cloudflare avtomatik DNS qila olmasa, ahost.uz da:

  Type: CNAME
  Name: kpi
  Value: {tid}.cfargotunnel.com
  Proxy: DNS only / yoki Cloudflare orange cloud

Keyin https://kpi.devflix.uz istalgan joydan ochiladi.
"""
)
c.close()
