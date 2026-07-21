/**
 * MRZ tarih alanları genelde YYMMDD (6 rakam) string olarak gelir.
 * Depolama için ISO (YYYY-MM-DD); gösterim için GG.AA.YYYY (01.01.2020).
 */

export function mrzSixDigitsToIso(yymmdd: string | null | undefined, kind: 'birth' | 'expiry'): string | null {
  if (!yymmdd || !/^\d{6}$/.test(String(yymmdd).trim())) return null;
  const raw = String(yymmdd).trim();
  const yy = parseInt(raw.slice(0, 2), 10);
  const mm = raw.slice(2, 4);
  const dd = raw.slice(4, 6);
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const now = Date.now();
  const nowY = new Date().getFullYear();
  const ageYears = (y: number) => {
    const t = Date.parse(`${y}-${mm}-${dd}T12:00:00Z`);
    if (Number.isNaN(t)) return null;
    return (now - t) / (365.25 * 24 * 3600 * 1000);
  };

  let year: number;
  if (kind === 'birth') {
    // YY belirsiz: 20xx geçmişteyse onu tercih et (otel misafiri 100+ nadir).
    // Eski mantık her iki yüzyıl da geçerliyken 19xx seçiyordu → 2006–günümüz çocukları ~100 yaş oluyordu.
    const y2000 = 2000 + yy;
    const y1900 = 1900 + yy;
    const age2000 = ageYears(y2000);
    const age1900 = ageYears(y1900);
    if (age2000 != null && age2000 >= 0 && age2000 <= 120) year = y2000;
    else if (age1900 != null && age1900 >= 0 && age1900 <= 120) year = y1900;
    else year = y2000;
  } else {
    const y2000 = 2000 + yy;
    const y1900 = 1900 + yy;
    if (y2000 >= nowY - 1) year = y2000;
    else if (y1900 >= nowY - 1) year = y1900;
    else year = y2000;
  }

  const iso = `${year}-${mm}-${dd}`;
  const parsed = Date.parse(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null;
  return iso;
}

/** YYYY-MM-DD → YYMMDD (NFC BAC / MRZ çip anahtarı) */
export function isoDateToMrzSix(iso: string | null | undefined): string | null {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]!.slice(2)}${m[2]}${m[3]}`;
}

/** YYYY-MM-DD → GG.AA.YYYY (ör. 01.01.2020 — KBS; yıl önde değil) */
export function formatIsoDateTr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(iso);
  return `${m[3]}.${m[2]}.${m[1]}`;
}
