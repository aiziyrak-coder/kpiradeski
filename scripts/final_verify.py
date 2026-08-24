import paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('87.192.230.208', port=2222, username='admin_root', password=P, timeout=30)
cmds = [
    "curl -sf https://kpi.devflix.uz/api/health",
    "curl -sf -X POST https://kpi.devflix.uz/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"super@klinikpi.uz\",\"password\":\"klinikpi123\"}' | python3 -c \"import sys,json; d=json.load(sys.stdin); print('login ok', d.get('user',{}).get('email'))\"",
    f"echo 'qazxsw123@!' | sudo -S docker ps --filter name=ishifo-web --format '{{{{.Names}}}} {{{{.Status}}}}'",
    "ls /etc/nginx/sites-enabled/",
]
for cmd in cmds:
    print('===', cmd[:90])
    _, o, e = c.exec_command(cmd, timeout=30)
    print(o.read().decode(errors='replace'))
    err = e.read().decode(errors='replace').strip()
    if err: print('ERR:', err[:200])
c.close()
