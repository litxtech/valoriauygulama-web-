const TR_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
};

export function normalizeCounterpartyName(name: string | null | undefined): string {
  if (!name?.trim()) return '';
  let s = name.trim();
  for (const [from, to] of Object.entries(TR_MAP)) {
    s = s.split(from).join(to);
  }
  return s
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeIban(iban: string | null | undefined): string | null {
  if (!iban?.trim()) return null;
  const clean = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^TR\d{24}$/.test(clean)) return null;
  return clean;
}

export function extractIbanFromText(text: string): string | null {
  const m = text.replace(/\s+/g, '').match(/TR\d{24}/i);
  return m ? normalizeIban(m[0]) : null;
}

export function extractTaxIdFromText(text: string): string | null {
  const digits = text.replace(/\D/g, ' ');
  const parts = digits.split(/\s+/).filter(Boolean);
  for (const p of parts) {
    if (/^[1-9]\d{10}$/.test(p)) return p;
    if (/^\d{10}$/.test(p)) return p;
  }
  const tckn = text.match(/\b([1-9]\d{10})\b/);
  if (tckn) return tckn[1];
  const vkn = text.match(/\b(\d{10})\b/);
  if (vkn) return vkn[1];
  return null;
}

/** SWIFT /TRxxx/ veya düz metinden isim çıkar */
export function extractNameFromNarrative(narrative: string, iban: string | null, taxId: string | null): string | null {
  const trPatterns = [
    /ALICI\s*(?:ADI|UNVAN)?[:\s-]+([A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&'-]{2,80})/i,
    /ALIC[:\s-]+([A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&'-]{2,80})/i,
    /GÖNDEREN[:\s-]+([A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&'-]{2,80})/i,
    /GONDEREN[:\s-]+([A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&'-]{2,80})/i,
    /KARŞI\s*HESAP[:\s-]+([A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&'-]{2,80})/i,
    /KARSI\s*HESAP[:\s-]+([A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&'-]{2,80})/i,
    /(?:GIDEN|GELEN)\s+(?:EFT|FAST|HAVALE)\s*[-–]?\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&'-]{2,60})/i,
    /(?:HAVALE|EFT|FAST)\s*[-–]?\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&'-]{2,60})/i,
    /(?:ODEME|ÖDEME)\s*[-–]?\s*([A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜa-zçğıöşü0-9\s.&'-]{2,60})/i,
  ];
  for (const re of trPatterns) {
    const m = narrative.match(re);
    if (m?.[1]) {
      const n = cleanName(m[1]);
      if (n.length >= 3 && !isFeeOnlyLabel(n)) return n;
    }
  }

  const structured =
    narrative.match(/\/(?:BENM|ORDP|NAME|REMI)\/([^/]+)/i)?.[1]?.trim() ??
    narrative.match(/\/NAME\/([^/]+)/i)?.[1]?.trim();

  if (structured && structured.length >= 3 && !/^TR\d/i.test(structured)) {
    return cleanName(structured);
  }

  let s = narrative;
  if (iban) s = s.replace(new RegExp(iban.replace(/(.{4})/g, '$1\\s?').trim(), 'gi'), ' ');
  if (taxId) s = s.replace(new RegExp(taxId, 'g'), ' ');
  s = s.replace(/TR\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}/gi, ' ');
  s = s.replace(/\b\d{10,11}\b/g, ' ');
  s = s.replace(/\/[A-Z]{3,4}\//g, ' ');

  const chunks = s
    .split(/[,;|]/)
    .map((c) => cleanName(c))
    .filter((c) => c.length >= 3 && !/^\d+$/.test(c) && !isFeeOnlyLabel(c));

  if (!chunks.length) return null;
  chunks.sort((a, b) => b.length - a.length);
  const best = chunks[0] ?? null;
  return best && !isFeeOnlyLabel(best) ? best : null;
}

function isFeeOnlyLabel(s: string): boolean {
  const t = s.trim();
  if (/^(şube|sube|hesap|bakiye|devreden|toplam)$/i.test(t)) return true;
  if (/^(eft|fast|havale|transfer|komisyon|ucret|ücret|masraf|bsmv|pos|atm|nakit)(\s|$)/i.test(t) && t.length < 22) {
    return true;
  }
  if (/\b(ucret|ücret|masraf|komisyon|bsmv|bedel)\b/i.test(t) && t.length < 26 && !/\b(ltd|a\.?\s*ş|san|tic)\b/i.test(t)) {
    return true;
  }
  return false;
}

function cleanName(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(
      /^(HAVALE|EFT|FAST|GELEN|GIDEN|GİDEN|TRANSFER|ODEME|ÖDEME|GIDEN\s*EFT|GELEN\s*EFT|GIDEN\s*FAST|GELEN\s*FAST)\s*[-–:]?\s*/i,
      ''
    )
    .replace(/\s*(?:UCRET|ÜCRET|MASRAF|KOMISYON|KOMİSYON|BSMV|BEDEL(?:I|İ)?)\s*$/i, '')
    .replace(/\s*[-–]\s*$/g, '')
    .trim();
}

export function levenshteinSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}

export function buildGroupKey(params: {
  iban: string | null;
  taxId: string | null;
  name: string | null;
}): string {
  if (params.iban) return `iban:${params.iban}`;
  if (params.taxId) return `tax:${params.taxId}`;
  const n = normalizeCounterpartyName(params.name);
  if (n) return `name:${n}`;
  return `unknown:${Math.random().toString(36).slice(2)}`;
}

export function normalizeTimeToSeconds(time: string | null | undefined): string {
  if (!time?.trim()) return '00:00:00';
  const t = time.trim().replace('.', ':');
  const parts = t.split(':');
  const hh = (parts[0] ?? '00').padStart(2, '0');
  const mm = (parts[1] ?? '00').padStart(2, '0');
  const ss = (parts[2] ?? '00').padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Açıklamadan dekont / fiş / işlem numarası çıkar */
export function extractDocumentNumberFromText(text: string): string | null {
  if (!text?.trim()) return null;
  const patterns = [
    /\b(?:REF|REFERANS|DEKONT|FİŞ|FIS|İŞLEM|ISLEM|BELGE|FISNO)\s*(?:NO|NUM)?[:\s#-]*([A-Z0-9-]{4,24})\b/i,
    /\b(?:REF|REFERANS|DEKONT|FİŞ|FIS|İŞLEM|ISLEM|BELGE|FISNO)[:\s#-]+([A-Z0-9-]{4,24})\b/i,
    /\b([A-Z]{2,6}\d{3,16})\b/,
    /\b(\d{8,16})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const candidate = m[1].trim().replace(/\s+/g, '').toUpperCase();
    if (candidate.length < 4) continue;
    if (/^TR\d{24}$/.test(candidate)) continue;
    return candidate;
  }
  return null;
}

export function documentFingerprint(
  bankReference: string | null | undefined,
  description: string
): string {
  const ref = (bankReference ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (ref) return ref;
  const fromDesc = extractDocumentNumberFromText(description);
  if (fromDesc) return fromDesc;
  return description.trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 120);
}

export function buildDedupKey(params: {
  bankCode?: string;
  accountIban: string | null;
  valueDate: string;
  valueTime?: string | null;
  direction: string;
  amount: number;
  bankReference: string | null;
  description: string;
}): string {
  const acct = params.accountIban ? normalizeIban(params.accountIban) ?? params.accountIban : 'noacct';
  const time = normalizeTimeToSeconds(params.valueTime);
  const doc = documentFingerprint(params.bankReference, params.description);
  return [acct, params.valueDate, time, params.direction, params.amount.toFixed(2), doc].join('|');
}

/** Eski içe aktarmalarla eşleşme (geriye dönük) */
export function buildLegacyDedupKey(params: {
  bankCode?: string;
  accountIban: string | null;
  valueDate: string;
  direction: string;
  amount: number;
  bankReference: string | null;
  description: string;
}): string {
  const ref = params.bankReference?.trim() || params.description.slice(0, 80).trim();
  return [
    params.bankCode ?? 'other',
    params.accountIban ?? 'noacct',
    params.valueDate,
    params.direction,
    params.amount.toFixed(2),
    ref,
  ].join('|');
}

export type BankImportLineDedupFields = {
  dedupKey: string;
  valueDate: string;
  valueTime: string | null;
  direction: string;
  amount: number;
  bankReference: string | null;
  description: string;
};

export function syncImportLineDedupKeys<T extends BankImportLineDedupFields>(
  lines: T[],
  accountIban: string | null
): T[] {
  return lines.map((line) => ({
    ...line,
    dedupKey: buildDedupKey({
      accountIban,
      valueDate: line.valueDate,
      valueTime: line.valueTime,
      direction: line.direction,
      amount: line.amount,
      bankReference: line.bankReference,
      description: line.description,
    }),
  }));
}
