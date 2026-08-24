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


def _deploy_host() -> str:
    """Server manzili — env bilan almashtiriladi.

    Ilgari bu yerda 87.192.230.208:2222 qatʼiy yozilgan edi va u endi
    javob bermaydi; server LAN ichida 192.168.0.101:22 da.
    """
    return _os.environ.get("DEPLOY_SSH_HOST", "192.168.0.101")


def _deploy_port() -> int:
    return int(_os.environ.get("DEPLOY_SSH_PORT", "22"))

import paramiko, sys, tempfile
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
S = f"echo '{P}' | sudo -S"
ROOT = Path(__file__).resolve().parents[1]
DOMAIN = "kpi.devflix.uz"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username='admin_root', password=P, timeout=30)
sftp = c.open_sftp()

def run(cmd, t=300):
    print('$', cmd[:140])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors='replace')
    if out.strip(): print(out)
    err = e.read().decode(errors='replace').strip()
    if err and code != 0: print('ERR:', err[:500])
    return code, out

# nginx
conf = (ROOT / "deploy/nginx/kpi.devflix.uz.conf").read_text(encoding="utf-8")
tmp = Path(tempfile.gettempdir()) / "kpi.devflix.uz.conf"
tmp.write_text(conf, encoding="utf-8")
sftp.put(str(tmp), "/home/admin_root/kpi.devflix.uz.conf")
tmp.unlink(missing_ok=True)

run(S + " cp /home/admin_root/kpi.devflix.uz.conf /etc/nginx/sites-available/kpi.devflix.uz")
run(S + " ln -sf /etc/nginx/sites-available/kpi.devflix.uz /etc/nginx/sites-enabled/kpi.devflix.uz")
run(S + " nginx -t")
run(S + " systemctl reload nginx")

# SSL
code, _ = run(
    S + f" certbot --nginx -d {DOMAIN} --non-interactive --agree-tos -m super@klinikpi.uz --redirect",
    t=300,
)
if code == 0:
    run(S + " nginx -t && systemctl reload nginx")

# health via domain
run(f"curl -sf -o /dev/null -w '%{{http_code}}' https://{DOMAIN}/login || curl -sf -o /dev/null -w '%{{http_code}}' http://{DOMAIN}/login")
run(f"curl -sf https://{DOMAIN}/api/health || curl -sf http://127.0.0.1:13000/api/health")

# disable initial seed
run("sed -i 's/ALLOW_INITIAL_SEED=true/ALLOW_INITIAL_SEED=false/' /home/admin_root/kpiradeski/.env")
run(S + " bash -lc 'cd /home/admin_root/kpiradeski && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml up -d api'")

sftp.close()
c.close()
print('NGINX+SSL DONE')
