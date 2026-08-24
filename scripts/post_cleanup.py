import paramiko, time, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)
S = f"echo '{P}' | sudo -S"
APP = "/home/admin_root/kpiradeski"
compose = f"cd {APP} && docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.server.yml"
inner = compose + ' exec -T db psql -U klinikpi -d klinikpi -c "DELETE FROM \\"KpiWeight\\" WHERE \\"blockKey\\" IN (\'warehouse\',\'doctors\');"'
_, o, e = c.exec_command(f"{S} bash -lc {repr(inner)}", timeout=60)
print("WEIGHT:", o.read().decode(), e.read().decode()[-400:])
for i in range(15):
    _, o, _ = c.exec_command("curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/login", timeout=30)
    code = o.read().decode().strip()
    print("login", i+1, code)
    if code == "200":
        break
    time.sleep(8)
_, o, _ = c.exec_command(f"{S} bash -lc '{compose} ps'", timeout=60)
print(o.read().decode()[-800:])
c.close()
print("OK")
