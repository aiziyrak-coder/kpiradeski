"""Install LAN IP nginx access for phones on clinic Wi-Fi."""
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
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
CONF = open(
    r"E:\KPIRadeski\deploy\nginx\kpi-lan-ip.conf", encoding="utf-8"
).read()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.0.101", port=22, username="admin_root", password=P, timeout=30)
sftp = c.open_sftp()
with sftp.file("/tmp/kpi-lan-ip.conf", "w") as f:
    f.write(CONF)
sftp.close()

cmds = [
    f"echo '{P}' | sudo -S cp /tmp/kpi-lan-ip.conf /etc/nginx/sites-available/kpi-lan-ip",
    f"echo '{P}' | sudo -S ln -sfn /etc/nginx/sites-available/kpi-lan-ip /etc/nginx/sites-enabled/kpi-lan-ip",
    f"echo '{P}' | sudo -S nginx -t",
    f"echo '{P}' | sudo -S systemctl reload nginx",
    "curl -sI -m 5 http://192.168.0.101/ | head -15",
    "curl -sI -m 5 http://192.168.0.101/login | head -12",
]
for cmd in cmds:
    print("$", cmd[:100])
    _, o, e = c.exec_command(cmd, timeout=40)
    print(o.read().decode(errors="replace"))
    err = e.read().decode(errors="replace")
    err = "\n".join(ln for ln in err.splitlines() if "password for" not in ln.lower())
    if err.strip():
        print(err[-800:])
c.close()
print("LAN NGINX DONE")
