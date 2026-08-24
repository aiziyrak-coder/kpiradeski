import paramiko
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
PASSWORD = "qazxsw123@!"
SUDO = f"echo '{PASSWORD}' | sudo -S"
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('87.192.230.208', port=2222, username='admin_root', password=PASSWORD, timeout=30)
for cmd in [
    "groups",
    f"{SUDO} docker ps --format '{{{{.Names}}}}' | head -5",
    "ls -la /home/admin_root/kpiradeski/ | head -15",
]:
    _, stdout, stderr = c.exec_command(cmd, timeout=30)
    print(stdout.read().decode())
    print(stderr.read().decode())
c.close()
