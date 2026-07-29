/**
 * POS fiş tarih/saat çıkarımı — OCR gürültüsüne dayanıklı.
 * Etiketli (TARIH / İŞLEM TARİHİ) adaylar öncelikli; batch QA için skor + aday listesi.
 */

const META_DATETIME_INLINE =
  /(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})\s*[/\sT\-]\s*(\d{1,2}:\d{2}(?::\d{2})?)/;

const META_ISO_DATE =
  /(?:fi[sş]\s*)?(?:islem\s*)?tarih(?:i)?(?:\s*\/?\s*saat)?\s*[:\s]*(\d{4})[.\-/](\d{2})[.\-/](\d{2})(?:[T\s]+(\d{1,2}:\d{2}(?::\d{2})?))?/i;

const META_TIME_ONLY = /(?:saat|time)\s*[:\s]*(\d{1,2}:\d{2}(?::\d{2})?)/i;

const DATE_LABEL =
  /(?:fi[sş]\s*)?(?:islem\s*)?tarih(?:i)?|slip\s*date|transaction\s*date|\bdate\b/i;

const TR_MONTHS: Record<string, number> = {
  ocak: 1,
  subat: 2,
  şubat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  mayıs: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  ağustos: 8,
  eylul: 9,
  eylül: 9,
  ekim: 10,
  kasim: 11,
  kasım: 11,
  aralik: 12,
  aralık: 12,
};

/** OCR harf→rakam düzeltmesi (tarih/saat satırları) */
export function fixOcrDigits(raw: string): string {
  return raw
    .replace(/[OoQ]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss\$]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2')
    .replace(/[Gg]/g, '9')
    .replace(/\s+/g, '');
}

function isValidYmd(y: number, mm: number, dd: number): boolean {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mm - 1, dd));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mm - 1 && dt.getUTCDate() === dd;
}

function withinReceiptWindow(y: number, mm: number, dd: number): boolean {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const cand = new Date(y, mm - 1, dd, 12, 0, 0);
  const diffDays = Math.round((cand.getTime() - today.getTime()) / 86400000);
  // Saat dilimi / ertesi gün fişleri için +5 gün; ~4 yıl geriye
  if (diffDays > 5) return false;
  if (diffDays < -1500) return false;
  return true;
}

function toYmd(y: number, mm: number, dd: number): string | null {
  if (!isValidYmd(y, mm, dd)) return null;
  if (!withinReceiptWindow(y, mm, dd)) return null;
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function parseTrDate(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const cleaned = fixOcrDigits(raw.trim()).replace(/[^\d./\-]/g, '');

  // ISO yyyy-mm-dd
  const iso = cleaned.match(/^(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})$/);
  if (iso) {
    return toYmd(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
  }

  const m = cleaned.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$/);
  if (!m) return null;
  let dd = parseInt(m[1], 10);
  let mm = parseInt(m[2], 10);
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  const y = parseInt(yyyy, 10);

  // Gün/ay ters: ay>12 ise swap
  if (mm > 12 && dd >= 1 && dd <= 12) {
    const t = dd;
    dd = mm;
    mm = t;
  }

  return toYmd(y, mm, dd);
}

export function normalizeTime(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const cleaned = fixOcrDigits(raw.trim());
  const m = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh > 23 || mm > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}:${(m[3] ?? '00').padStart(2, '0')}`;
}

export type PosDateCandidate = {
  date: string;
  time: string | null;
  score: number;
  source: string;
};

export type PosDateExtractResult = {
  receiptDate: string | null;
  receiptTime: string | null;
  candidates: PosDateCandidate[];
  /** 0–100 */
  dateConfidence: number;
  ambiguous: boolean;
};

function parseTrMonthNameDate(line: string): string | null {
  const m = line.match(
    /(\d{1,2})\s+(ocak|subat|şubat|mart|nisan|may[ıi]s|haziran|temmuz|a[gğ]ustos|eyl[uü]l|ekim|kas[ıi]m|aral[ıi]k)\s+(\d{2,4})/i
  );
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const monthKey = m[2].toLowerCase();
  const mm = TR_MONTHS[monthKey];
  if (!mm) return null;
  let y = parseInt(m[3], 10);
  if (m[3].length === 2) y = 2000 + y;
  return toYmd(y, mm, dd);
}

/** Etiketli tarih + satır içi adaylardan en güvenilirini seç */
export function extractReceiptDateTime(
  joined: string,
  lines: string[]
): PosDateExtractResult {
  const candidates: PosDateCandidate[] = [];

  const push = (dateRaw: string | null, timeRaw: string | null, score: number, source: string) => {
    const date = parseTrDate(dateRaw);
    if (!date) return;
    candidates.push({ date, time: normalizeTime(timeRaw), score, source });
  };

  const iso = joined.match(META_ISO_DATE);
  if (iso) {
    const date = toYmd(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
    if (date) {
      candidates.push({
        date,
        time: normalizeTime(iso[4] ?? null),
        score: 125,
        source: 'iso-labeled',
      });
    }
  }

  const labeled = joined.matchAll(
    /(?:fi[sş]\s*)?(?:islem\s*)?tarih(?:i)?(?:\s*\/?\s*saat)?\s*[:\s]*(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})(?:\s*[/\sT\-]\s*(\d{1,2}:\d{2}(?::\d{2})?))?/gi
  );
  for (const m of labeled) {
    push(m[1], m[2] ?? null, 110, 'tarih-label');
  }

  // Compact: TARIH 29072026 / TARIH:290726
  const compactLabeled = joined.matchAll(
    /(?:fi[sş]\s*)?(?:islem\s*)?tarih(?:i)?\s*[:\s]*(\d{6}|\d{8})(?!\d)/gi
  );
  for (const m of compactLabeled) {
    const digits = m[1];
    if (digits.length === 8) {
      push(`${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`, null, 95, 'compact8-label');
    } else {
      push(`${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`, null, 90, 'compact6-label');
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hasLabel = DATE_LABEL.test(line);
    const nearLabel =
      hasLabel ||
      (i > 0 && DATE_LABEL.test(lines[i - 1])) ||
      (i + 1 < lines.length && DATE_LABEL.test(lines[i + 1]));

    const monthName = parseTrMonthNameDate(line);
    if (monthName) {
      candidates.push({
        date: monthName,
        time: null,
        score: hasLabel ? 105 : nearLabel ? 70 : 35,
        source: 'month-name',
      });
    }

    const inline = line.match(META_DATETIME_INLINE);
    if (inline) push(inline[1], inline[2], hasLabel ? 100 : nearLabel ? 55 : 40, 'inline-dt');

    const onlyDate = line.match(/(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/);
    if (onlyDate && (hasLabel || nearLabel)) {
      push(onlyDate[1], null, hasLabel ? 85 : 60, 'near-label');
    }

    // Üst satırda sadece etiket, alt satırda tarih
    if (hasLabel && amountsLookLikeDateOnly(line) === false) {
      const next = lines[i + 1];
      if (next) {
        const nd = next.match(/(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/);
        const nt = next.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
        if (nd) push(nd[1], nt?.[1] ?? null, 92, 'label-next-line');
      }
    }
  }

  if (!candidates.length) {
    const inline = joined.match(META_DATETIME_INLINE);
    if (inline) push(inline[1], inline[2], 35, 'fallback-dt');
    // Üst %40 satırlarda gevşek tarih (promo/alt bilgiye göre tercih)
    const head = lines.slice(0, Math.max(4, Math.ceil(lines.length * 0.45))).join('\n');
    const headDate = head.match(/(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/);
    if (headDate) push(headDate[1], null, 22, 'head-loose');
    const loose = joined.match(/(\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4})/);
    if (loose) push(loose[1], null, 12, 'loose');
  }

  if (!candidates.length) {
    return {
      receiptDate: null,
      receiptTime: normalizeTime(joined.match(META_TIME_ONLY)?.[1] ?? null),
      candidates: [],
      dateConfidence: 0,
      ambiguous: false,
    };
  }

  // Aynı tarih skorlarını birleştir
  const byDate = new Map<string, PosDateCandidate>();
  for (const c of candidates) {
    const prev = byDate.get(c.date);
    if (!prev || c.score > prev.score) {
      byDate.set(c.date, {
        ...c,
        score: (prev?.score ?? 0) + c.score * 0.15 + c.score * 0.85,
        time: c.time ?? prev?.time ?? null,
      });
    } else {
      prev.score += c.score * 0.2;
      if (!prev.time && c.time) prev.time = c.time;
    }
  }
  const ranked = [...byDate.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.date.localeCompare(a.date);
  });

  const best = ranked[0];
  const second = ranked[1];
  const ambiguous = !!second && best.score - second.score < 18 && best.date !== second.date;

  let time = best.time;
  if (!time) time = normalizeTime(joined.match(META_TIME_ONLY)?.[1] ?? null);

  const dateConfidence = Math.max(
    0,
    Math.min(100, Math.round(best.score + (best.time ? 8 : 0) - (ambiguous ? 25 : 0)))
  );

  return {
    receiptDate: best.date,
    receiptTime: time,
    candidates: ranked.slice(0, 5),
    dateConfidence,
    ambiguous,
  };
}

function amountsLookLikeDateOnly(line: string): boolean {
  return /^\s*(?:fi[sş]\s*)?(?:islem\s*)?tarih(?:i)?\s*[:\s]*\d/i.test(line);
}

/** OCR erken çıkış / skor için hızlı tarih var mı? */
export function ocrTextHasReceiptDate(text: string): boolean {
  if (!text?.trim()) return false;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 2);
  if (!lines.length) return false;
  return extractReceiptDateTime(lines.join('\n'), lines).receiptDate != null;
}
