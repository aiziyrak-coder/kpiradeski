"""Production wipe for go-live: zero stats/analytics, keep structure.

KEEP:
  User, Branch, BranchManager, Position,
  KpiCatalogNode, KpiAssignmentTemplate, KpiWeight,
  AppSetting, Holiday, Doctor, WarehouseProduct, TaskTemplate

WIPE:
  All KPI day entries / proofs / scores / date assignments,
  marketing & clinic check logs, AI reports, notifications,
  audit logs, daily tasks / proofs, monthly scores.
"""
import os
import paramiko
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = os.environ.get("DEPLOY_SSH_PASSWORD") or os.environ.get("KPI_DEPLOY_PASS") or "qazxsw123@!"
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)

SQL = r"""
BEGIN;

-- KPI ish natijalari / ballar (shablon biriktirishlar saqlanadi)
DELETE FROM "KpiProof";
DELETE FROM "KpiDayEntry";
DELETE FROM "KpiTaskAssignment";
DELETE FROM "DailyScore";

-- Marketing / klinik demo yozuvlar
DELETE FROM "AiWeeklyReport";
DELETE FROM "MysteryPatientTest";
DELETE FROM "DoctorReferral";
DELETE FROM "DoctorStory";
DELETE FROM "BloggerEntry";
DELETE FROM "FlyerEntry";
DELETE FROM "AdsCheck";
DELETE FROM "SocialStats";
DELETE FROM "SeoCheck";
DELETE FROM "Review";
DELETE FROM "CallEntry";
DELETE FROM "WarehouseCheck";
DELETE FROM "UniformCheck";
DELETE FROM "ReceptionCheck";
DELETE FROM "DailyClinicCheck";

-- Vazifa / xabar / audit
DELETE FROM "TaskProof";
DELETE FROM "DailyTask";
DELETE FROM "MonthlyEmployeeScore";
DELETE FROM "StaffMonthlyReport";
DELETE FROM "Notification";
DELETE FROM "AuditLog";

-- Eski uydirma integratsiya auditi (65/100 va h.k.)
DELETE FROM "AppSetting" WHERE key = 'integrations_last_audit';

COMMIT;

SELECT
  (SELECT COUNT(*) FROM "KpiDayEntry") AS entries,
  (SELECT COUNT(*) FROM "KpiProof") AS proofs,
  (SELECT COUNT(*) FROM "DailyScore") AS scores,
  (SELECT COUNT(*) FROM "KpiTaskAssignment") AS date_assigns,
  (SELECT COUNT(*) FROM "Notification") AS notifications,
  (SELECT COUNT(*) FROM "AiWeeklyReport") AS ai_reports,
  (SELECT COUNT(*) FROM "User") AS users,
  (SELECT COUNT(*) FROM "Branch") AS branches,
  (SELECT COUNT(*) FROM "BranchManager") AS branch_managers,
  (SELECT COUNT(*) FROM "KpiAssignmentTemplate" WHERE active) AS templates,
  (SELECT COUNT(*) FROM "KpiCatalogNode" WHERE active) AS catalog;
"""

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("87.192.230.208", port=2222, username="admin_root", password=P, timeout=30)

sftp = c.open_sftp()
with sftp.file("/tmp/clean_ops.sql", "w") as f:
    f.write(SQL.replace("\r\n", "\n"))
sftp.close()


def run(cmd, t=300):
    full = f"echo '{P}' | sudo -S bash -lc {repr(cmd)}"
    print(">", cmd[:180])
    _, o, e = c.exec_command(full, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out[-3000:])
    err = "\n".join(ln for ln in err.splitlines() if "password for" not in ln.lower())
    if err.strip():
        print("ERR", err[-800:])
    return code


# Wipe uploaded proof files on disk (DB rows already deleted)
run(f"rm -rf {APP}/uploads/* 2>/dev/null; mkdir -p {APP}/uploads; true")

run(f"{compose} cp /tmp/clean_ops.sql db:/tmp/clean_ops.sql")
code = run(f"{compose} exec -T db psql -U klinikpi -d klinikpi -f /tmp/clean_ops.sql")
if code != 0:
    c.close()
    sys.exit(code)

c.close()
print("OPS CLEAN DONE")
