/**
 * Batch fiş tarihleri — eksik / aykırı / düşük güven bayrakları.
 */

export type PosDateFlag = 'missing' | 'outlier' | 'low_confidence' | 'ambiguous';

export type PosDateQaItem = {
  key: string;
  receiptDate?: string | null;
  warnings?: string[] | null;
};

export type PosDateQaResult = {
  key: string;
  flags: PosDateFlag[];
  suggestedDate: string | null;
  message: string | null;
};

function parseYmd(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function modeDate(dates: string[]): string | null {
  if (!dates.length) return null;
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(d, (counts.get(d) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [d, n] of counts) {
    if (n > bestN || (n === bestN && best != null && d > best)) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

function medianDate(dates: string[]): string | null {
  if (!dates.length) return null;
  const sorted = [...dates].sort();
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function dayDiff(a: string, b: string): number {
  const da = parseYmd(a);
  const db = parseYmd(b);
  if (!da || !db) return 999;
  return Math.abs(Math.round((da.getTime() - db.getTime()) / 86400000));
}

/** Batch içi tarih tutarlılığı — çoğunluk tarihine göre aykırıları işaretle */
export function validateBatchReceiptDates(
  items: PosDateQaItem[],
  opts?: { outlierDays?: number }
): PosDateQaResult[] {
  const outlierDays = opts?.outlierDays ?? 3;
  const dated = items
    .map((it) => it.receiptDate)
    .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  const consensus = modeDate(dated) ?? medianDate(dated);
  const majorityCount = consensus
    ? dated.filter((d) => d === consensus).length
    : 0;
  const useConsensus = dated.length >= 3 && majorityCount >= 2;

  return items.map((it) => {
    const flags: PosDateFlag[] = [];
    const warnings = it.warnings ?? [];
    if (!it.receiptDate) {
      flags.push('missing');
    } else {
      if (warnings.some((w) => /belirsiz|alternatif/i.test(w))) flags.push('ambiguous');
      if (warnings.some((w) => /düşük güvenilirlik/i.test(w))) flags.push('low_confidence');
      if (useConsensus && consensus && dayDiff(it.receiptDate, consensus) > outlierDays) {
        flags.push('outlier');
      }
    }

    let message: string | null = null;
    if (flags.includes('missing')) {
      message = useConsensus && consensus
        ? `Tarih yok — batch çoğunluğu ${consensus}`
        : 'Tarih okunamadı';
    } else if (flags.includes('outlier') && consensus) {
      message = `Şüpheli tarih ${it.receiptDate} — diğerleri ~${consensus}`;
    } else if (flags.includes('ambiguous')) {
      message = 'Tarih belirsiz — kontrol edin';
    } else if (flags.includes('low_confidence')) {
      message = 'Tarih düşük güvenilirlik';
    }

    return {
      key: it.key,
      flags,
      suggestedDate: flags.includes('missing') || flags.includes('outlier') ? consensus : null,
      message,
    };
  });
}

export function applyDateQaWarnings<T extends { key: string; warnings?: string[]; receiptDate?: string | null }>(
  items: T[],
  qa: PosDateQaResult[]
): T[] {
  const byKey = new Map(qa.map((q) => [q.key, q]));
  return items.map((it) => {
    const q = byKey.get(it.key);
    if (!q?.message) return it;
    const warnings = [...(it.warnings ?? [])];
    if (!warnings.some((w) => w.includes(q.message!))) {
      warnings.unshift(`🗓 ${q.message}`);
    }
    return { ...it, warnings };
  });
}
