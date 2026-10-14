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

/** AI matnidagi markdown belgilarini olib tashlash (eski hisobotlar ham toza koʻrinsin) */
export function cleanAiText(text: string) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[*•]\s+/gm, '- ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*{2,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
