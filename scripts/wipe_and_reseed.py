"""Full DB wipe + reseed branch/users; catalog seeds on API start."""
import os as _os


def _deploy_password() -> str:
    """Deploy paroli — faqat env orqali.

    Ilgari bu yerda parol ochiq yozilgan edi va repo ommaviy. Kalitni kodga
    qaytarmang: `DEPLOY_SSH_PASSWORD` (yoki `KPI_DEPLOY_PASS`) ni oʻrnating.
    """
    pw = _os.environ.get("DEPLOY_SSH_PASSWORD") or _os.environ.get("KPI_DEPLOY_PASS")
    if not pw:
        raise SystemExit(
            "DEPLOY_SSH_PASSWORD oʻrnatilmagan. "
            "PowerShell: $env:DEPLOY_SSH_PASSWORD='...'  |  bash: export DEPLOY_SSH_PASSWORD='...'"
        )
    return pw


def _deploy_host() -> str:
    """Server manzili — env bilan almashtiriladi.

    Ilgari bu yerda 87.192.230.208:2222 qatʼiy yozilgan edi va u endi
    javob bermaydi; server LAN ichida 192.168.0.101:22 da.
    """
    return _os.environ.get("DEPLOY_SSH_HOST", "192.168.0.101")


def _deploy_port() -> int:
    return int(_os.environ.get("DEPLOY_SSH_PORT", "22"))

import paramiko
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
P = _deploy_password()
APP = "/home/admin_root/kpiradeski"
compose = (
    f"cd {APP} && docker compose -f docker-compose.yml "
    f"-f docker-compose.prod.yml -f docker-compose.server.yml"
)
HASH = "$2b$12$8nbXHfH7RPy8cmjijm6lTuaWGA9Ymj/vwmfRbAfBJie6/3NUp3tl."

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(_deploy_host(), port=_deploy_port(), username="admin_root", password=P, timeout=30)

sql = f"""
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations') LOOP
    EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
  END LOOP;
END $$;

INSERT INTO "Branch" (id, name, address, active, "createdAt", "updatedAt")
VALUES ('branch-main', 'Radeski Dermatologiya', 'Toshkent', true, NOW(), NOW());

INSERT INTO "User" (id, name, email, "passwordHash", role, "branchId", active, "tokenVersion", "createdAt", "updatedAt")
VALUES
  ('user-admin', 'Admin', 'super@klinikpi.uz', '{HASH}', 'SUPER_ADMIN', 'branch-main', true, 0, NOW(), NOW());

INSERT INTO "AppSetting" (key, value, "updatedAt")
VALUES ('rest_weekdays', '[0,6]'::jsonb, NOW());
"""

sftp = c.open_sftp()
with sftp.file("/tmp/wipe_reseed.sql", "w") as f:
    f.write(sql.replace("\r\n", "\n"))
sftp.close()


def run(cmd, t=300):
    full = f"echo '{P}' | sudo -S bash -lc {repr(cmd)}"
    print(">", cmd[:160])
    _, o, e = c.exec_command(full, timeout=t)
    code = o.channel.recv_exit_status()
    out = o.read().decode(errors="replace")
    err = e.read().decode(errors="replace")
    if out.strip():
        print(out[-2000:])
    err = "\n".join(ln for ln in err.splitlines() if "password for" not in ln.lower())
    if err.strip():
        print("ERR", err[-1000:])
    return code


run(f"{compose} cp /tmp/wipe_reseed.sql db:/tmp/wipe_reseed.sql")
run(f"{compose} exec -T db psql -U klinikpi -d klinikpi -f /tmp/wipe_reseed.sql")
run(f"{compose} up -d --force-recreate api")
time.sleep(18)
run(f"{compose} ps")
run(f"{compose} logs api --tail 40")
c.close()
print("WIPE DONE")
