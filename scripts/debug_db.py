import paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
S = f"echo '{P}' | sudo -S"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('87.192.230.208', port=2222, username='admin_root', password=P, timeout=30)
cmds = [
    "grep POSTGRES /home/admin_root/kpiradeski/.env",
    f"{S} docker exec klinikpi-db env | grep POSTGRES",
    f"{S} docker exec klinikpi-api env | grep -E 'DATABASE|POSTGRES'",
    f"{S} docker exec klinikpi-api node -e \"const {{PrismaClient}}=require('@prisma/client'); const p=new PrismaClient(); p.\\$queryRaw\\`SELECT 1\\`.then(r=>{{console.log('ok',r);return p.\\$disconnect()}}).catch(e=>{{console.error(e);process.exit(1)}})\" 2>&1",
]
for cmd in cmds:
    print('===', cmd[:100])
    _, o, e = c.exec_command(cmd, timeout=60)
    print(o.read().decode(errors='replace'))
    print(e.read().decode(errors='replace'))
c.close()
