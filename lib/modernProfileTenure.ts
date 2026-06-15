/** Ortak kıdem / tenure hesapları — profil ekranları. */

export function calculateDaysWithUs(isoDate: string, anchorMs: number): number | null {
  const joinedAt = new Date(isoDate);
  if (Number.isNaN(joinedAt.getTime())) return null;
  const anchor = new Date(anchorMs);
  const joinedDay = Date.UTC(joinedAt.getFullYear(), joinedAt.getMonth(), joinedAt.getDate());
  const anchorDay = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  return Math.max(1, Math.floor((anchorDay - joinedDay) / (24 * 60 * 60 * 1000)) + 1);
}

export function tenureBreakdown(days: number): { years: number; months: number; days: number } {
  const years = Math.floor(days / 365);
  const rem = days % 365;
  const months = Math.floor(rem / 30);
  const d = rem % 30;
  return { years, months, days: d };
}

export function resolveProfileLocale(lang: string) {
  const code = (lang || 'en').toLowerCase();
  if (code.startsWith('tr')) return 'tr-TR';
  if (code.startsWith('de')) return 'de-DE';
  if (code.startsWith('fr')) return 'fr-FR';
  if (code.startsWith('es')) return 'es-ES';
  if (code.startsWith('ru')) return 'ru-RU';
  if (code.startsWith('ar')) return 'ar-SA';
  return 'en-US';
}

export function formatTenureDate(d: Date, lang: string) {
  return d.toLocaleDateString(resolveProfileLocale(lang), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function formatProfileDateShort(iso: string | null | undefined, lang: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(resolveProfileLocale(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function buildTenureTimeline(isoDate: string, anchorMs: number): Date[] {
  const start = new Date(isoDate);
  if (Number.isNaN(start.getTime())) return [];
  const anchor = new Date(anchorMs);
  const rows: Date[] = [start];
  const cursor = new Date(start);
  let safety = 0;
  while (cursor.getTime() < anchor.getTime() && safety < 360) {
    cursor.setMonth(cursor.getMonth() + 1);
    if (cursor.getTime() <= anchor.getTime()) rows.push(new Date(cursor));
    safety += 1;
  }
  if (rows[rows.length - 1]?.toDateString() !== anchor.toDateString()) rows.push(anchor);
  return rows;
}

export function formatStatCompact(n: number, lang: string): string {
  const locale = resolveProfileLocale(lang);
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })}M`;
  if (n >= 10_000) return `${(n / 1_000).toLocaleString(locale, { maximumFractionDigits: 1 })}K`;
  return n.toLocaleString(locale);
}

export function formatLastActiveShort(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMin = Math.floor((Date.now() - t) / 60_000);
  if (diffMin < 1) return lang.startsWith('tr') ? 'Az önce' : 'Just now';
  if (diffMin < 60) return lang.startsWith('tr') ? `${diffMin} dk önce` : `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return lang.startsWith('tr') ? `${diffH} saat önce` : `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return lang.startsWith('tr') ? `${diffD} gün önce` : `${diffD}d ago`;
}
