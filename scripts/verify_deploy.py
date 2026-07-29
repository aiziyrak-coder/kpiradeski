import paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
S = f"echo '{P}' | sudo -S"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('87.192.230.208', port=2222, username='admin_root', password=P, timeout=30)
cmds = [
    f"{S} docker ps --filter name=klinikpi --format 'table {{{{.Names}}}}\t{{{{.Status}}}}\t{{{{.Ports}}}}'",
    "curl -sf http://127.0.0.1:13000/api/health",
    "curl -sf -X POST http://127.0.0.1:13000/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"super@klinikpi.uz\",\"password\":\"klinikpi123\"}' | head -c 200",
    f"grep -r 'kpi.devflix' /etc/nginx/sites-enabled/",
    f"{S} docker ps --filter name=ishifo --format '{{{{.Names}}}}' | wc -l",
]
for cmd in cmds:
    print('===', cmd[:90])
    _, o, _ = c.exec_command(cmd, timeout=30)
    print(o.read().decode(errors='replace'))
c.close()
