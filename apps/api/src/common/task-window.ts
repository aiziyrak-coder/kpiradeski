import { BUSINESS_TZ } from './kpi.constants';

export type WindowStatus = 'none' | 'upcoming' | 'open' | 'expired';

export type TaskWindowInfo = {
  startMin: number | null;
  endMin: number | null;
  startLabel: string | null;
  endLabel: string | null;
  status: WindowStatus;
  remainingSec: number | null;
  endsAt: string | null;
  startsAt: string | null;
};

const TZ_OFFSET_HOURS = 5; // Asia/Tashkent, DST yoʻq

export function formatHm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function tashkentClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  let hour = n('hour');
  if (hour === 24) hour = 0;
  return {
    year: n('year'),
    month: n('month'),
    day: n('day'),
    hour,
    minute: n('minute'),
    second: n('second'),
    minutes: hour * 60 + n('minute'),
    secondsOfDay: hour * 3600 + n('minute') * 60 + n('second'),
    dateISO: `${n('year')}-${String(n('month')).padStart(2, '0')}-${String(n('day')).padStart(2, '0')}`,
  };
}

function tashkentInstant(y: number, m: number, d: number, minutes: number, seconds = 0) {
  const h = Math.floor(minutes / 60);
  const min = minutes % 60;
  return new Date(Date.UTC(y, m - 1, d, h - TZ_OFFSET_HOURS, min, seconds));
}

export function evalTaskWindow(
  startMin: number | null | undefined,
  endMin: number | null | undefined,
  opts?: { dateISO?: string; now?: Date },
): TaskWindowInfo {
  const start = startMin == null ? null : Number(startMin);
  const end = endMin == null ? null : Number(endMin);
  const empty: TaskWindowInfo = {
    startMin: start,
    endMin: end,
    startLabel: start != null ? formatHm(start) : null,
    endLabel: end != null ? formatHm(end) : null,
    status: 'none',
    remainingSec: null,
    endsAt: null,
    startsAt: null,
  };
  if (start == null || end == null || end <= start) return empty;

  const clock = tashkentClock(opts?.now);
  const dateISO = opts?.dateISO || clock.dateISO;
  const [y, mo, d] = dateISO.split('-').map(Number);
  const startsAt = tashkentInstant(y, mo, d, start);
  const endsAt = tashkentInstant(y, mo, d, end);
  const now = opts?.now || new Date();

  empty.startLabel = formatHm(start);
  empty.endLabel = formatHm(end);
  empty.startsAt = startsAt.toISOString();
  empty.endsAt = endsAt.toISOString();

  if (now.getTime() < startsAt.getTime()) {
    return {
      ...empty,
      status: 'upcoming',
      remainingSec: Math.max(0, Math.floor((startsAt.getTime() - now.getTime()) / 1000)),
    };
  }
  if (now.getTime() >= endsAt.getTime()) {
    return { ...empty, status: 'expired', remainingSec: 0 };
  }
  return {
    ...empty,
    status: 'open',
    remainingSec: Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000)),
  };
}
