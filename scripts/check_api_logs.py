import paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
S = f"echo '{P}' | sudo -S"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('87.192.230.208', port=2222, username='admin_root', password=P, timeout=30)
cmds = [
    f"{S} docker logs klinikpi-api --tail 100 2>&1",
    f"{S} docker ps -a --filter name=klinikpi --format 'table {{{{.Names}}}}\t{{{{.Status}}}}'",
]
for cmd in cmds:
    print('===', cmd[:80])
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode(errors='replace'))
c.close()
