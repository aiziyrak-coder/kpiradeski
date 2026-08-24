/**
 * Klinik hodimlar roʻyxati — «руйхат» hujjatidan.
 * Rasmlar keyin admin yuklaydi (photoPath = pending).
 *
 * workDays: 1=Du … 6=Sha, 7=Ya
 * Vaqtlar — daqiqa (08:00 → 480).
 */

export type RosterRow = {
  branchHint: 'kokand' | 'fergana';
  lastName: string;
  firstName: string;
  position: string;
  arriveMin: number;
  leaveMin: number;
  workDays: string;
  satArriveMin?: number;
  satLeaveMin?: number;
};

const HM = (h: number, m = 0) => h * 60 + m;
const MON_FRI = '1,2,3,4,5';
const MON_SAT = '1,2,3,4,5,6';

export const EMPLOYEE_ROSTER: RosterRow[] = [
  // —— Qoqon / Kokand
  {
    branchHint: 'kokand',
    lastName: 'Baxriddinov',
    firstName: 'Zuhriddin',
    position: 'Shifokor',
    arriveMin: HM(8),
    leaveMin: HM(18),
    workDays: MON_FRI,
  },
  {
    branchHint: 'kokand',
    lastName: 'Turgunov',
    firstName: 'Shoxruz',
    position: 'Shifokor',
    arriveMin: HM(8),
    leaveMin: HM(18),
    workDays: MON_FRI,
  },
  {
    branchHint: 'kokand',
    lastName: 'Usmanova',
    firstName: 'Mohina',
    position: 'Shifokor',
    arriveMin: HM(8),
    leaveMin: HM(18),
    workDays: MON_SAT,
  },
  {
    branchHint: 'kokand',
    lastName: 'Karimova',
    firstName: 'Iroda',
    position: 'Shifokor',
    arriveMin: HM(8),
    leaveMin: HM(18),
    workDays: MON_SAT,
  },
  {
    branchHint: 'kokand',
    lastName: 'Turgunaliyeva',
    firstName: 'Umida',
    position: 'Registrator',
    arriveMin: HM(8),
    leaveMin: HM(16),
    workDays: MON_SAT,
    satArriveMin: HM(8),
    satLeaveMin: HM(14),
  },
  {
    branchHint: 'kokand',
    lastName: 'Xujayeva',
    firstName: 'Bibi',
    position: 'Registrator',
    arriveMin: HM(16),
    leaveMin: HM(19),
    workDays: MON_SAT,
    satArriveMin: HM(14),
    satLeaveMin: HM(18),
  },
  {
    branchHint: 'kokand',
    lastName: 'Saminova',
    firstName: 'Maxliye',
    position: 'Hamshira',
    arriveMin: HM(8),
    leaveMin: HM(18),
    workDays: MON_SAT,
  },
  {
    branchHint: 'kokand',
    lastName: 'Yuldasheva',
    firstName: 'Maxliye',
    position: 'Sanitarka',
    arriveMin: HM(8),
    leaveMin: HM(18),
    workDays: MON_SAT,
  },

  // —— Fargʻona / Fergana
  {
    branchHint: 'fergana',
    lastName: 'Ashurov',
    firstName: 'Dilshod',
    position: 'Shifokor',
    arriveMin: HM(10),
    leaveMin: HM(18),
    workDays: MON_SAT,
  },
  {
    branchHint: 'fergana',
    lastName: 'Abduvaliyev',
    firstName: 'Begali',
    position: 'Shifokor',
    arriveMin: HM(8),
    leaveMin: HM(17),
    workDays: MON_SAT,
  },
  {
    branchHint: 'fergana',
    lastName: 'Yekubov',
    firstName: 'Farrux',
    position: 'Shifokor',
    arriveMin: HM(8),
    leaveMin: HM(17),
    workDays: MON_SAT,
  },
  {
    branchHint: 'fergana',
    lastName: 'Kodirova',
    firstName: 'Dilfuza',
    position: 'Shifokor',
    arriveMin: HM(8),
    leaveMin: HM(17),
    workDays: MON_SAT,
  },
  {
    branchHint: 'fergana',
    lastName: 'Kamolova',
    firstName: 'Barno',
    position: 'Shifokor',
    arriveMin: HM(8),
    leaveMin: HM(17),
    workDays: MON_SAT,
  },
  {
    branchHint: 'fergana',
    lastName: 'Otajonova',
    firstName: 'Sogdiana',
    position: 'Registrator',
    arriveMin: HM(10),
    leaveMin: HM(18),
    workDays: MON_SAT,
  },
  {
    branchHint: 'fergana',
    lastName: 'Turaboyeva',
    firstName: 'Shaxodat',
    position: 'Hamshira',
    arriveMin: HM(8),
    leaveMin: HM(17),
    workDays: MON_SAT,
  },
  {
    branchHint: 'fergana',
    lastName: 'Abdullayeva',
    firstName: 'Farida',
    position: 'Hamshira',
    arriveMin: HM(8),
    leaveMin: HM(17),
    workDays: MON_SAT,
  },
  {
    branchHint: 'fergana',
    lastName: 'Gofurova',
    firstName: 'Zulfiya',
    position: 'Hamshira',
    arriveMin: HM(9),
    leaveMin: HM(18),
    workDays: MON_SAT,
  },
];

export function matchBranchHint(
  name: string,
  hint: RosterRow['branchHint'],
): boolean {
  const n = name.toLowerCase();
  if (hint === 'kokand') {
    return /kokand|qoqon|қўқон|куканд|kokand/.test(n);
  }
  return /fergana|fargona|fargʻona|фарғона|фергана/.test(n);
}

/** ISO weekday Mon=1 … Sun=7 from YYYY-MM-DD (Toshkent) */
export function weekdayMon1(dateISO: string): number {
  const d = new Date(`${dateISO}T12:00:00+05:00`);
  const js = d.getUTCDay(); // Sun=0
  return js === 0 ? 7 : js;
}

export function parseWorkDays(workDays: string | null | undefined): number[] {
  const raw = String(workDays || '1,2,3,4,5,6')
    .split(/[,;\s]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => n >= 1 && n <= 7);
  return raw.length ? raw : [1, 2, 3, 4, 5, 6];
}

export function scheduleForDay(
  emp: {
    expectedArriveMin: number;
    expectedLeaveMin?: number | null;
    workDays?: string | null;
    satArriveMin?: number | null;
    satLeaveMin?: number | null;
  },
  dateISO: string,
): { works: boolean; arriveMin: number; leaveMin: number | null } {
  const wd = weekdayMon1(dateISO);
  const days = parseWorkDays(emp.workDays);
  if (!days.includes(wd)) {
    return { works: false, arriveMin: emp.expectedArriveMin, leaveMin: emp.expectedLeaveMin ?? null };
  }
  if (wd === 6 && emp.satArriveMin != null) {
    return {
      works: true,
      arriveMin: emp.satArriveMin,
      leaveMin: emp.satLeaveMin ?? emp.expectedLeaveMin ?? null,
    };
  }
  return {
    works: true,
    arriveMin: emp.expectedArriveMin,
    leaveMin: emp.expectedLeaveMin ?? null,
  };
}
