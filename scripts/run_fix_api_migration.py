import paramiko
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
local = Path(__file__).with_name("fix_api_migration.sh")
remote = "/home/admin_root/fix_api_migration.sh"

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)
sftp = c.open_sftp()
sftp.put(str(local), remote)
sftp.chmod(remote, 0o755)
sftp.close()

cmd = f"echo '{P}' | sudo -S bash {remote}"
_, o, e = c.exec_command(cmd, timeout=300)
print(o.read().decode(errors="replace"))
print(e.read().decode(errors="replace")[-2000:])
c.close()
