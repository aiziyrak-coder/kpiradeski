import paramiko, sys, tempfile
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
S = f"echo '{P}' | sudo -S"
ROOT = Path(__file__).resolve().parents[1]
DOMAIN = "kpi.devflix.uz"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('87.192.230.208', port=2222, username='admin_root', password=P, timeout=30)
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
