import paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)
S = f"echo '{P}' | sudo -S"
# write sql file then exec
_, o, e = c.exec_command("printf \"%s\\n\" \"DELETE FROM \\\"KpiWeight\\\" WHERE \\\"blockKey\\\" IN ('warehouse','doctors');\" > /tmp/clean_w.sql", timeout=30)
print("write", o.read().decode(), e.read().decode())
cmd = f"{S} docker exec -i klinikpi-db psql -U klinikpi -d klinikpi < /tmp/clean_w.sql"
_, o, e = c.exec_command(cmd, timeout=60)
print("exec", o.read().decode(), e.read().decode()[-500:])
c.close()
