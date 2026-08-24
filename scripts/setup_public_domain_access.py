"""Install cloudflared and prepare named tunnel for kpi.devflix.uz."""
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
import time
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("192.168.0.101", port=22, username="admin_root", password=P, timeout=30)

def run(cmd, t=180):
    print("$", cmd[:140])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    err = "\n".join(ln for ln in err.splitlines() if "password for" not in ln.lower())
    if out.strip():
        print(out[-3000:])
    if err.strip():
        print(err[-1500:])
    return code, out, err

# Install cloudflared
run(
    f"echo '{P}' | sudo -S bash -lc '"
    "if ! command -v cloudflared >/dev/null; then "
    "curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && "
    "chmod +x /usr/local/bin/cloudflared; "
    "fi; cloudflared --version'"
)

# dnsmasq for LAN: Wi-Fi phones with DNS=192.168.0.101 get local IP
run(
    f"echo '{P}' | sudo -S bash -lc '"
    "apt-get install -y dnsmasq >/tmp/dnsmasq-install.log 2>&1 | tail -3; "
    "cat > /etc/dnsmasq.d/kpi-lan.conf <<EOF\n"
    "listen-address=192.168.0.101\n"
    "bind-interfaces\n"
    "no-resolv\n"
    "server=8.8.8.8\n"
    "server=1.1.1.1\n"
    "address=/kpi.devflix.uz/192.168.0.101\n"
    "EOF\n"
    "systemctl enable dnsmasq; systemctl restart dnsmasq; systemctl is-active dnsmasq; "
    "dig @192.168.0.101 kpi.devflix.uz +short'"
)

# Check existing cert
run("ls -la /home/admin_root/.cloudflared/ 2>/dev/null; ls -la /root/.cloudflared/ 2>/dev/null; echo done")

c.close()
print("INSTALL BASE DONE")
