/** Türkiye takvim günü için tam etiket: 31.12.2026 Pazartesi */

export const WEEKDAYS_TR_FULL = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Yerel takvim günü YYYY-MM-DD */
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * @param ymd ISO tarih dizesi (YYYY-MM-DD), yerel gün olarak yorumlanır
 */
export function formatTrFullDayLabelFromYmd(ymd: string): string {
  const s = (ymd || '').slice(0, 10);
  const [y, m, day] = s.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !day) return ymd;
  const dt = new Date(y, m - 1, day);
  if (Number.isNaN(dt.getTime())) return ymd;
  const wd = WEEKDAYS_TR_FULL[dt.getDay()];
  return `${pad2(day)}.${pad2(m)}.${y} ${wd}`;
}

export function escapeHtmlMealMenu(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
