export const CLINIC_ITEMS = [
  { key: 'cleanliness', label: 'Tozalik', desc: 'Xonalar, sanuzellar, mebel' },
  { key: 'supplies', label: 'Zarur buyumlar', desc: "Qog'oz, sovun, sochiq, dezinfektsiya" },
  { key: 'odor', label: 'Hid nazorati', desc: "Begona hid yo'qligi, freshener" },
  { key: 'waste', label: 'Chiqindi qutilari', desc: "Sinflar bo'yicha utilizatsiya" },
  { key: 'syringe', label: 'Shprits utilizatsiyasi', desc: 'Maxsus konteynerlar holati' },
  { key: 'tv', label: 'TV reklama', desc: 'Yoqilgan va ishlayotgani' },
  { key: 'music', label: "Yo'lakdagi musiqa", desc: 'Yoqilgan, qulay ovoz' },
  { key: 'ac', label: 'Konditsioner', desc: "Zarurat bo'yicha yoqilgan/o'chirilgan" },
  { key: 'flowers', label: 'Gullar', desc: "Sug'orilgan, parvarishlangan" },
] as const;

export const RECEPTION_ITEMS = [
  { key: 'qr', label: 'QR-kod', desc: 'Sharh qoldirish uchun ishlayapti' },
  { key: 'candy', label: 'Konfet idishi', desc: "To'ldirilgan" },
  { key: 'cooler', label: 'Kuller va suv', desc: "To'liq, stakanlar bilan" },
  { key: 'meds', label: 'Dorivor vositalar', desc: 'Mavjudligi' },
  { key: 'cosmetics', label: 'Kosmetik preparatlar', desc: 'Mavjud va tartibli' },
] as const;

export const UNIFORM_ITEMS = [
  { key: 'gown', label: 'Xalatlar tozaligi', desc: 'Toza va ozoda' },
  { key: 'condition', label: 'Forma holati', desc: "Shikastlanmagan, ozoda ko'rinish" },
  { key: 'badge', label: 'Bedj mavjudligi', desc: 'Barcha xodimlarda' },
  { key: 'standard', label: 'Korporativ standart', desc: 'Standartga muvofiqlik' },
] as const;

export const WAREHOUSE_ITEMS = [
  { key: 'pharmacy', label: 'Apteka preparatlari', desc: 'Asosiy dorilar mavjudligi' },
  { key: 'cosmetic', label: 'Kosmetik vositalar', desc: 'Mavjudligi va yaroqlilik' },
  { key: 'household', label: "Xo'jalik tovarlari", desc: "Qog'oz, sovun, dezinfektorlar" },
  { key: 'expiry', label: 'Yaroqlilik muddati', desc: "Muddati o'tgan preparatlar" },
  { key: 'stock', label: 'Zaxira darajasi', desc: 'Keyingi 2 haftaga yetarlilik' },
  { key: 'orders', label: 'Buyurtma va yetkazib berish', desc: "O'z vaqtida" },
] as const;

export const DEFAULT_WEIGHTS = [
  { blockKey: 'clinic', blockName: "Klinika ko'rigi", weight: 20, frequency: 'daily' },
  { blockKey: 'reception', blockName: 'Retsepshn', weight: 15, frequency: 'daily' },
  { blockKey: 'calls', blockName: "Qo'ng'iroqlar", weight: 25, frequency: 'daily' },
  { blockKey: 'reviews', blockName: 'Sharhlar', weight: 10, frequency: 'daily' },
  { blockKey: 'uniform', blockName: 'Uniforma', weight: 10, frequency: 'daily' },
  { blockKey: 'smm', blockName: 'SMM va sayt', weight: 15, frequency: 'daily' },
  { blockKey: 'marketing', blockName: 'Reklama va marketing', weight: 5, frequency: 'daily' },
] as const;

export const BUSINESS_TZ = 'Asia/Tashkent';

export function pct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 1000) / 10);
}

export function colorStatus(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

function partsInTz(instant: Date, timeZone = BUSINESS_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  return {
    y: Number(parts.find((p) => p.type === 'year')!.value),
    m: Number(parts.find((p) => p.type === 'month')!.value),
    d: Number(parts.find((p) => p.type === 'day')!.value),
  };
}

/** Biznes kuni — Asia/Tashkent */
export function todayInTashkent(): Date {
  const { y, m, d } = partsInTz(new Date());
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Date-only (UTC midnight) — biznes TZ.
 * - string "YYYY-MM-DD" → shu kun
 * - Date → shu instantning Toshkentdagi kalendar kuni
 * - undefined → bugun (Toshkent)
 */
export function toDateOnly(input?: string | Date): Date {
  if (!input) return todayInTashkent();
  if (input instanceof Date) {
    const { y, m, d } = partsInTz(input);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const [y, m, d] = input.split('-').map(Number);
  if (!y || !m || !d) return todayInTashkent();
  return new Date(Date.UTC(y, m - 1, d));
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function formatTashkentDateTime(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('uz-UZ', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
