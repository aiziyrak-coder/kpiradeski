"""Delete demo manager accounts from production (do not recreate)."""
import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = "qazxsw123@!"
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)

SQL = """
-- Demo managerlar
DELETE FROM "BranchManager"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email IN ('manager@klinikpi.uz', 'manager@radeski.uz')
     OR id IN ('user-manager', 'user-manager-radeski')
);

UPDATE "KpiDayEntry" SET "userId" = NULL
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email IN ('manager@klinikpi.uz', 'manager@radeski.uz')
     OR id IN ('user-manager', 'user-manager-radeski')
);

UPDATE "KpiProof" SET "userId" = NULL
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email IN ('manager@klinikpi.uz', 'manager@radeski.uz')
     OR id IN ('user-manager', 'user-manager-radeski')
);

UPDATE "KpiAssignmentTemplate" SET "assignedById" = NULL
WHERE "assignedById" IN (
  SELECT id FROM "User"
  WHERE email IN ('manager@klinikpi.uz', 'manager@radeski.uz')
     OR id IN ('user-manager', 'user-manager-radeski')
);

UPDATE "KpiTaskAssignment" SET "assignedById" = NULL
WHERE "assignedById" IN (
  SELECT id FROM "User"
  WHERE email IN ('manager@klinikpi.uz', 'manager@radeski.uz')
     OR id IN ('user-manager', 'user-manager-radeski')
);

DELETE FROM "Notification"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email IN ('manager@klinikpi.uz', 'manager@radeski.uz')
     OR id IN ('user-manager', 'user-manager-radeski')
);

DELETE FROM "AuditLog"
WHERE "userId" IN (
  SELECT id FROM "User"
  WHERE email IN ('manager@klinikpi.uz', 'manager@radeski.uz')
     OR id IN ('user-manager', 'user-manager-radeski')
);

DELETE FROM "User"
WHERE email IN ('manager@klinikpi.uz', 'manager@radeski.uz')
   OR id IN ('user-manager', 'user-manager-radeski');

SELECT email, role, active FROM "User" ORDER BY email;
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)
sftp = c.open_sftp()
with sftp.file("/tmp/del_demo_mgr.sql", "w") as f:
    f.write(SQL.replace("\r\n", "\n"))
sftp.close()


def run(cmd, t=120):
    full = f"echo '{P}' | sudo -S bash -lc {repr(cmd)}"
    _, o, e = c.exec_command(full, timeout=t)
    code = o.channel.recv_exit_status()
    print(o.read().decode(errors="replace")[-3000:])
    err = "\n".join(
        ln for ln in e.read().decode(errors="replace").splitlines() if "password for" not in ln.lower()
    )
    if err.strip():
        print("ERR", err[-800:])
    return code


run(f"{compose} cp /tmp/del_demo_mgr.sql db:/tmp/del_demo_mgr.sql")
run(f"{compose} exec -T db psql -U klinikpi -d klinikpi -f /tmp/del_demo_mgr.sql")
c.close()
print("DEMO MANAGERS REMOVED")
