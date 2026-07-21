import clsx from 'clsx';

export function cn(...inputs: Array<string | false | null | undefined>) {
  return clsx(inputs);
}

export function statusClass(color?: string) {
  if (color === 'green') return 'bg-emerald-50 text-status-green border-emerald-200';
  if (color === 'yellow') return 'bg-amber-50 text-status-yellow border-amber-200';
  return 'bg-rose-50 text-status-red border-rose-200';
}

export function statusDot(color?: string) {
  if (color === 'green') return 'bg-status-green';
  if (color === 'yellow') return 'bg-status-yellow';
  return 'bg-status-red';
}
