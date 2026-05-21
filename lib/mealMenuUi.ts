import { toLocalYmd, WEEKDAYS_TR_FULL } from '@/lib/mealMenuDate';

export type MealFields = { breakfast: string; lunch: string; dinner: string };
export type MealSlotKey = keyof MealFields;

export const MEAL_SLOTS: {
  key: MealSlotKey;
  label: string;
  shortLabel: string;
  icon: 'sunny-outline' | 'restaurant-outline' | 'moon-outline';
  tint: string;
  border: string;
  iconColor: string;
}[] = [
  {
    key: 'breakfast',
    label: 'Kahvaltı',
    shortLabel: 'Kahvaltı',
    icon: 'sunny-outline',
    tint: '#fffbeb',
    border: '#fde68a',
    iconColor: '#d97706',
  },
  {
    key: 'lunch',
    label: 'Öğle yemeği',
    shortLabel: 'Öğle',
    icon: 'restaurant-outline',
    tint: '#fff7ed',
    border: '#fed7aa',
    iconColor: '#ea580c',
  },
  {
    key: 'dinner',
    label: 'Akşam yemeği',
    shortLabel: 'Akşam',
    icon: 'moon-outline',
    tint: '#eef2ff',
    border: '#c7d2fe',
    iconColor: '#4f46e5',
  },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseYmd(ymd: string) {
  const s = (ymd || '').slice(0, 10);
  const [y, m, day] = s.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, day || 1);
  const dow = dt.getDay();
  return {
    y,
    m,
    day,
    dt,
    weekdayFull: WEEKDAYS_TR_FULL[dow] ?? '',
    weekdayShort: (WEEKDAYS_TR_FULL[dow] ?? '').slice(0, 3),
    isWeekend: dow === 0 || dow === 6,
  };
}

export function countFilledSlots(fields: MealFields): number {
  return MEAL_SLOTS.reduce((n, s) => n + (fields[s.key]?.trim() ? 1 : 0), 0);
}

export function dayFillStatus(fields: MealFields): 'empty' | 'partial' | 'full' {
  const n = countFilledSlots(fields);
  if (n === 0) return 'empty';
  if (n === 3) return 'full';
  return 'partial';
}

export function menuStatsFromDaysMap(daysMap: Record<string, MealFields>, todayYmd: string) {
  const keys = Object.keys(daysMap).sort();
  let filledDays = 0;
  let partialDays = 0;
  let todaySlots = 0;
  for (const k of keys) {
    const f = daysMap[k] ?? { breakfast: '', lunch: '', dinner: '' };
    const st = dayFillStatus(f);
    if (st === 'full') filledDays += 1;
    else if (st === 'partial') partialDays += 1;
    if (k === todayYmd) todaySlots = countFilledSlots(f);
  }
  return { totalDays: keys.length, filledDays, partialDays, todaySlots };
}

/** Pazartesi başlangıçlı hafta grupları */
export function groupDayKeysByWeek(keys: string[]): { weekKey: string; label: string; keys: string[] }[] {
  const buckets = new Map<string, string[]>();
  for (const ymd of keys) {
    const { dt } = parseYmd(ymd);
    const dow = dt.getDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(dt);
    monday.setDate(dt.getDate() + mondayOffset);
    const weekKey = toLocalYmd(monday);
    const arr = buckets.get(weekKey) ?? [];
    arr.push(ymd);
    buckets.set(weekKey, arr);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, weekKeys]) => {
      const sorted = weekKeys.sort();
      const first = parseYmd(sorted[0]);
      const last = parseYmd(sorted[sorted.length - 1]);
      const label =
        first.m === last.m
          ? `${pad2(first.day)}–${pad2(last.day)} ${MONTHS_TR_SHORT[(first.m || 1) - 1]}`
          : `${pad2(first.day)} ${MONTHS_TR_SHORT[(first.m || 1) - 1]} – ${pad2(last.day)} ${MONTHS_TR_SHORT[(last.m || 1) - 1]}`;
      return { weekKey, label, keys: sorted };
    });
}

const MONTHS_TR_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function weekKeyForYmd(ymd: string): string {
  const { dt } = parseYmd(ymd);
  const dow = dt.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(dt);
  monday.setDate(dt.getDate() + mondayOffset);
  return toLocalYmd(monday);
}

export function fillStatusLabel(status: 'empty' | 'partial' | 'full'): string {
  if (status === 'full') return 'Tam';
  if (status === 'partial') return 'Eksik';
  return 'Boş';
}

export function daysInMonthFromDate(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function ymdForDayInMonth(viewMonth: Date, day: number): string {
  return `${viewMonth.getFullYear()}-${pad2(viewMonth.getMonth() + 1)}-${pad2(day)}`;
}

/** Seçili ayın ilk günü (yerel). */
export function monthStartDate(viewMonth: Date): Date {
  return new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
}

/** Bugünden önceki aylar düzenlenemez. */
export function isPastMealMonth(viewMonth: Date, todayYmd: string): boolean {
  const dim = daysInMonthFromDate(viewMonth);
  return ymdForDayInMonth(viewMonth, dim) < todayYmd;
}

/** Menü oluşturma/düzenleme: yalnızca bugün ve sonrası (seçili ay içinde). */
export function editableMealDayKeys(viewMonth: Date, todayYmd: string): string[] {
  const dim = daysInMonthFromDate(viewMonth);
  const monthStart = ymdForDayInMonth(viewMonth, 1);
  const monthEnd = ymdForDayInMonth(viewMonth, dim);
  if (monthEnd < todayYmd) return [];
  const startYmd = monthStart >= todayYmd ? monthStart : todayYmd;
  const [sy, sm, sd] = startYmd.split('-').map((x) => parseInt(x, 10));
  const endDt = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), dim);
  const keys: string[] = [];
  const cur = new Date(sy, sm - 1, sd);
  while (cur <= endDt) {
    keys.push(toLocalYmd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

export function buildEmptyDaysMap(keys: string[]): Record<string, MealFields> {
  const map: Record<string, MealFields> = {};
  for (const k of keys) {
    map[k] = { breakfast: '', lunch: '', dinner: '' };
  }
  return map;
}
