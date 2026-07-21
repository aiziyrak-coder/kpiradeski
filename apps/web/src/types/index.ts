export type Role = 'ADMIN' | 'MANAGER' | 'DIRECTOR' | 'SUPER_ADMIN' | 'STAFF';

export interface Position {
  id: string;
  code: string;
  nameUz: string;
  nameRu: string;
  active?: boolean;
  sortOrder?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  positionId?: string | null;
  position?: Position | null;
  positionLabel?: string | null;
  positionLabelRu?: string | null;
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

/** @deprecated use useI18n().roleLabel */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  MANAGER: 'Menejer',
  DIRECTOR: 'Direktor',
  SUPER_ADMIN: 'Super Admin',
  STAFF: 'Xodim',
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
  return '/today';
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

export function userPositionLabel(
  u: { position?: Position | null; positionLabel?: string | null; positionLabelRu?: string | null },
  lang: 'uz' | 'ru' = 'uz',
) {
  if (u.position) return lang === 'ru' ? u.position.nameRu : u.position.nameUz;
  return lang === 'ru' ? u.positionLabelRu : u.positionLabel;
}
