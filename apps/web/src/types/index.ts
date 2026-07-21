export type Role = 'ADMIN' | 'MANAGER' | 'DIRECTOR' | 'SUPER_ADMIN' | 'STAFF';

export type StaffPosition =
  | 'CLINIC'
  | 'RECEPTION'
  | 'SMM'
  | 'WAREHOUSE'
  | 'MARKETING'
  | 'MANAGEMENT'
  | 'OTHER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  position?: StaffPosition | null;
  branchId?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  telegramId?: string | null;
  branch?: { id: string; name: string } | null;
  active?: boolean;
}

export interface DailyScore {
  id?: string;
  date: string;
  totalScore: number;
  blockScores: Record<string, number>;
  colorStatus: 'green' | 'yellow' | 'red' | string;
}

export interface ChecklistItemMeta {
  key: string;
  label: string;
  desc: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Menejer',
  DIRECTOR: 'Direktor',
  SUPER_ADMIN: 'Super Admin',
  STAFF: 'Xodim',
};

export const POSITION_LABELS: Record<StaffPosition, string> = {
  CLINIC: 'Klinika admini',
  RECEPTION: 'Retsepshn',
  SMM: 'SMM / kontent',
  WAREHOUSE: 'Ombor',
  MARKETING: 'Marketing',
  MANAGEMENT: 'Menejment',
  OTHER: 'Boshqa',
};

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function weekStartISO(from = todayISO()) {
  const [y, m, d] = from.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const day = utc.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + diff);
  return utc.toISOString().slice(0, 10);
}

export function homeForRole(role: Role): string {
  if (role === 'DIRECTOR') return '/dashboard';
  if (role === 'SUPER_ADMIN') return '/team';
  if (role === 'STAFF') return '/my';
  if (role === 'ADMIN' || role === 'MANAGER') return '/today';
  return '/dashboard';
}

export function formatTashkent(iso: string | Date) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function scoreColor(score: number) {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}
