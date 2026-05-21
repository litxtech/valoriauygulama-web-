/** Pasaport / kimlik arşivi: günlük gruplama ve arama. */

export type MrzArchiveGuest = {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
} | null;

export type MrzArchiveSearchable = {
  created_at: string;
  document_type: string;
  document_number: string | null;
  guest?: MrzArchiveGuest;
};

export type MrzCalendarDayGroup<T extends MrzArchiveSearchable> = {
  dayKey: string;
  dayLabelKey: 'today' | 'yesterday' | 'date';
  dayLabelDate: string | null;
  items: T[];
};

function dayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayKey(): string {
  return dayKeyFromIso(new Date().toISOString());
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKeyFromIso(d.toISOString());
}

export function guestDisplayName(g: MrzArchiveGuest): string {
  if (!g) return '';
  const fromParts = [g.first_name, g.last_name].filter(Boolean).join(' ').trim();
  if (fromParts) return fromParts;
  return g.full_name?.trim() ?? '';
}

function normalizeSearchToken(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const DOC_TYPE_LABEL: Record<string, string> = {
  passport: 'pasaport',
  id_card: 'kimlik',
  residence_permit: 'ikamet',
  other: 'belge',
};

/** Ad, soyad, tam ad, belge no ve tür ile arama. */
export function filterMrzArchiveRows<T extends MrzArchiveSearchable>(rows: T[], query: string): T[] {
  const q = normalizeSearchToken(query);
  if (!q) return rows;
  const tokens = q.split(' ').filter(Boolean);
  return rows.filter((row) => {
    const name = normalizeSearchToken(guestDisplayName(row.guest ?? null));
    const docNo = normalizeSearchToken(row.document_number ?? '');
    const docType = DOC_TYPE_LABEL[row.document_type] ?? row.document_type;
    const haystack = `${name} ${docNo} ${docType}`.trim();
    return tokens.every((tok) => haystack.includes(tok));
  });
}

/** Bugün, dün ve tarih başlıklarıyla grupla (en yeni gün üstte). */
export function groupMrzDocsByCalendarDay<T extends MrzArchiveSearchable>(
  rows: T[]
): MrzCalendarDayGroup<T>[] {
  const today = todayKey();
  const yesterday = yesterdayKey();
  const map = new Map<string, T[]>();

  for (const row of rows) {
    const key = dayKeyFromIso(row.created_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, items]) => {
      let dayLabelKey: MrzCalendarDayGroup<T>['dayLabelKey'] = 'date';
      if (dayKey === today) dayLabelKey = 'today';
      else if (dayKey === yesterday) dayLabelKey = 'yesterday';
      return {
        dayKey,
        dayLabelKey,
        dayLabelDate: dayLabelKey === 'date' ? dayKey : null,
        items: items.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        ),
      };
    });
}

export function formatArchiveDayTitle(
  group: Pick<MrzCalendarDayGroup<unknown>, 'dayLabelKey' | 'dayLabelDate'>,
  t: (key: string, opts?: Record<string, string>) => string,
  locale: string
): string {
  if (group.dayLabelKey === 'today') return t('staffPassportsDayToday');
  if (group.dayLabelKey === 'yesterday') return t('staffPassportsDayYesterday');
  if (!group.dayLabelDate) return '';
  const [y, m, d] = group.dayLabelDate.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return dt.toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function documentTypeLabelTr(documentType: string): string {
  const m: Record<string, string> = {
    passport: 'Pasaport',
    id_card: 'Kimlik',
    residence_permit: 'İkamet',
    other: 'Belge',
  };
  return m[documentType] ?? documentType;
}
