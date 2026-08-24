import paramiko, sys, tarfile, tempfile
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
ROOT = Path(__file__).resolve().parents[1]
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('87.192.230.208', port=2222, username='admin_root', password=P, timeout=30)
sftp = c.open_sftp()

# upload changed files only
for rel in ["apps/web/Dockerfile", "docker-compose.yml"]:
    local = ROOT / rel
    remote = f"{APP}/{rel.replace(chr(92), '/')}"
    sftp.put(str(local), remote)
    print("uploaded", rel)

compose = f"{S} bash -lc 'cd {APP} && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml build web --no-cache && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml up -d web'"
print('rebuilding web...')
_, o, e = c.exec_command(compose, timeout=1800)
print(o.read().decode(errors='replace')[-3000:])
print(e.read().decode(errors='replace')[-1000:])

import time
for _ in range(30):
    _, o, _ = c.exec_command("curl -sf http://127.0.0.1:13000/api/health", timeout=20)
    out = o.read().decode()
    if 'ok' in out:
        print('HEALTH OK:', out)
        break
    time.sleep(10)
else:
    _, o, _ = c.exec_command(f"{S} docker logs klinikpi-web --tail 20", timeout=30)
    print(o.read().decode())

sftp.close()
c.close()
