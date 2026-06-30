const MONTH_TR: Record<string, number> = {
  ocak: 1,
  şubat: 2,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayıs: 5,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  ağustos: 8,
  agustos: 8,
  eylül: 9,
  eylul: 9,
  ekim: 10,
  kasım: 11,
  kasim: 11,
  aralık: 12,
  aralik: 12,
};

export function parseStatementDate(raw: string | null | undefined): { date: string | null; time: string | null } {
  if (!raw?.trim()) return { date: null, time: null };
  const s = raw.trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (iso) {
    const time = iso[4] ? `${iso[4]}:${iso[5]}:${iso[6] ?? '00'}` : null;
    return { date: `${iso[1]}-${iso[2]}-${iso[3]}`, time };
  }

  const dmyTime = s.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\s+(\d{1,2})[:.](\d{2})(?::(\d{2}))?)?/
  );
  if (dmyTime) {
    let yyyy = dmyTime[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    const dd = dmyTime[1].padStart(2, '0');
    const mm = dmyTime[2].padStart(2, '0');
    const time = dmyTime[4] ? `${dmyTime[4].padStart(2, '0')}:${dmyTime[5]}:${dmyTime[6] ?? '00'}` : null;
    return { date: `${yyyy}-${mm}-${dd}`, time };
  }

  const ymd = s.match(/^(\d{4})[./-](\d{2})[./-](\d{2})/);
  if (ymd) return { date: `${ymd[1]}-${ymd[2]}-${ymd[3]}`, time: null };

  const trMonth = s.match(/(\d{1,2})\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)\s+(\d{4})/i);
  if (trMonth) {
    const m = MONTH_TR[trMonth[2].toLowerCase()];
    if (m) {
      return {
        date: `${trMonth[3]}-${String(m).padStart(2, '0')}-${trMonth[1].padStart(2, '0')}`,
        time: null,
      };
    }
  }

  return { date: null, time: null };
}

export function parseCurrencyCode(text: string): string {
  const u = text.toUpperCase();
  if (u.includes('USD') || u.includes('$')) return 'USD';
  if (u.includes('EUR') || u.includes('€')) return 'EUR';
  if (u.includes('GBP') || u.includes('£')) return 'GBP';
  if (u.includes('TRY') || u.includes('TL') || u.includes('₺')) return 'TRY';
  const m = u.match(/\b([A-Z]{3})\b/);
  if (m && m[1] !== 'REF' && m[1] !== 'EFT') return m[1];
  return 'TRY';
}

export function parseStatementAmount(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  let s = raw.trim().replace(/\s/g, '');
  const neg = s.startsWith('-') || s.startsWith('(') || s.endsWith('-');
  s = s.replace(/^[(-]+/, '').replace(/[)]$/, '').replace(/-$/, '');
  s = s.replace(/[^\d,.-]/g, '');
  if (!s) return null;

  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length <= 2) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '');
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n) || n === 0) return null;
  return neg ? -Math.abs(n) : n;
}
