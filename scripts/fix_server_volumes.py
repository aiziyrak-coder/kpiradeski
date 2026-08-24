import paramiko, sys, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
APP = "/home/admin_root/kpiradeski"
S = f"echo '{P}' | sudo -S"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('87.192.230.208', port=2222, username='admin_root', password=P, timeout=30)

def run(cmd, t=600):
    print('$', cmd[:120])
    _, o, e = c.exec_command(cmd, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors='replace')
    if out.strip(): print(out)
    err = e.read().decode(errors='replace').strip()
    if err and code != 0: print('ERR:', err)
    return code

compose = f"{S} bash -lc 'cd {APP} && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml"
run(f"{compose} down -v'")
run(f"{compose} up -d --build'", t=1800)
print('Waiting...')
for i in range(40):
    _, o, _ = c.exec_command("curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/login", timeout=30)
    if '200' in o.read().decode(): print('WEB OK'); break
    time.sleep(10)
else:
    run(f"{S} docker logs klinikpi-api --tail 40")
c.close()
