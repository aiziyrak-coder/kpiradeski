import paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('87.192.230.208', port=2222, username='admin_root', password=P, timeout=30)
for cmd in [
    "curl -sv http://127.0.0.1:13000/api/health 2>&1 | tail -20",
    "curl -sv http://127.0.0.1:13000/login 2>&1 | tail -5",
    "curl -sv https://kpi.devflix.uz/api/health 2>&1 | tail -15",
    "curl -sv -X POST https://kpi.devflix.uz/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"super@klinikpi.uz\",\"password\":\"klinikpi123\"}' 2>&1 | tail -10",
]:
    print('===', cmd)
    _, o, _ = c.exec_command(cmd, timeout=30)
    print(o.read().decode(errors='replace'))
c.close()
