/**
 * POS fiş OCR alan çıkarımı — tutar (kuruş), fiş no, banka.
 * Banka slip: SATIŞ TUTARI / İŞLEM TUTARI / TOPLAM öncelikli; müşteri adı yoksayılır.
 */

import { expandReceiptOcrLines } from '@/lib/posReceiptInvoice/cleanupPosOcrText';

const NOT_TOTAL =
  /ara\s*t[o0]plam|kdv\s*%|%\s*\d{1,2}|matrah|iskonto|indirim|puan|para\s*[uü]st|nakit\s*[uü]st|iade|iptal|komisyon|provizyon|kdv\s*t[o0]plam|toplam\s*kdv|vergi\s*t[o0]plam|kdv\s*tutari|kdv\s*tutarı|vergiler\s*toplam|kdv\s*hari[cç]/i;

/** Müşteri / kart hamili — tutar veya işyeri sanılmasın */
const PERSON_LINE =
  /musteri|m[uü][sş]teri|card\s*holder|kart\s*hamil|holder\s*name|ad\s*soyad|cardholder|musteri\s*ad/i;

/** Tarih satırı — tarih rakamları tutar sanılmasın */
const DATE_LINE =
  /(?:^|\b)(?:fi[sş]\s*)?tarih\b|^\s*date\b|tarih\s*[/:]|saat\s*[/:]|^\d{1,2}[./]\d{1,2}[./]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?\s*$/i;

/** Banka POS — en yüksek öncelikli tutar etiketleri */
const BANK_SALE_LABEL =
  /sat[iı1][sş5]\s*tutar(?:[iı1])?|satistutar|[iı1][sş5]lem\s*tutar(?:[iı1])?|islemtutar|sales?\s*amount|transaction\s*amount|islemin\s*tutari/i;

const STRONG_TOTAL =
  /(?:ö|o)denecek(?:\s*tutar)?|genel\s*t[o0]plam|yek[uü]n|kdv\s*dahil(?:\s*t[o0]plam)?|grand\s*total|amount\s*due|fi[sş]\s*t[o0]plam|sat[iı1][sş5]\s*t[o0]plam|toplam\s*tutar|net\s*t[o0]plam|tahsil\s*edilen|karttan\s*[cç]ekilen|ödeme\s*tutari|odeme\s*tutari|t[o0]plam\s*[öo]deme|[iı][sş]lem\s*tutar|islem\s*tutar|sat[iı1][sş5]\s*tutar(?:[iı1])?|\*\s*t[o0]plam|t[o0]plam\s*\*|(?:^|[^a-zçğıöşü0-9])t[o0]plam(?:\s*tutar)?(?=\s|$|[:.*₺]|\d)/i;

const WEAK_TOTAL =
  /top[il1]am|(?:ö|o)denen|kart\s*t[o0]plam|pos\s*t[o0]plam|(?:^|[^a-zçğıöşü])tutar\s*[:.]|toplam\s*:/i;

const BANK_NAME_ONLY =
  /^(?:akbank|garanti(?:\s*bbva)?|yap[ıi]\s*kredi|yapikredi|[iı][sş]\s*bank|isbank|ziraat|qnb|finansbank|halkbank|vak[ıi]fbank|denizbank|teb|ing|enpara|papara|kuveyt|albaraka|fibabanka|[sş]ekerbank|odeabank|world|bonus|maximum|axess|bankkart|paraf|troy)$/i;

const RECEIPT_NO_BLACKLIST =
  /^(?:tl|try|kdv|pos|visa|master|troy|nakit|kart|banka|onay|provizyon|terminal|batch|rrn|stan|ref|auth|sale|satis|sat[iı][sş]|musteri)$/i;

const LABEL_AMOUNT =
  /(?:ö|o)denecek|genel\s*t[o0]plam|yek[uü]n|toplam\s*tutar|sat[iı1][sş5]\s*t[o0]plam|fi[sş]\s*t[o0]plam|karttan\s*[cç]ekilen|tahsil\s*edilen|kdv\s*dahil|net\s*t[o0]plam|[iı][sş]lem\s*tutar|islem\s*tutar|sat[iı1][sş5]\s*tutar(?:[iı1])?|(?:^|[^a-zçğıöşü0-9])t[o0]plam(?:\s*tutar)?|(?:^|[^a-zçğıöşü])tutar\s*[:.]/i;

type BankCanon = { re: RegExp; name: string };

const BANKS: BankCanon[] = [
  { re: /garanti\s*bbva|garant[iı]\s*bbva|garantibbva/i, name: 'Garanti BBVA' },
  { re: /garanti(?!\s*bbva)/i, name: 'Garanti BBVA' },
  { re: /yap[ıi]\s*kredi|yapikredi|yapi\s*kredi/i, name: 'Yapı Kredi' },
  { re: /[iı][sş]\s*bankas[ıi]|isbank|i[sş]bank/i, name: 'İş Bankası' },
  { re: /z[iı]raat|ziraat/i, name: 'Ziraat Bankası' },
  { re: /akbank/i, name: 'Akbank' },
  { re: /qnb\s*finans|finansbank|qnb/i, name: 'QNB Finansbank' },
  { re: /halk\s*bank|halkbank/i, name: 'Halkbank' },
  { re: /vak[ıi]f\s*bank|vakifbank|vak[ıi]fbank/i, name: 'VakıfBank' },
  { re: /deniz\s*bank|denizbank/i, name: 'DenizBank' },
  { re: /\bteb\b/i, name: 'TEB' },
  { re: /\bing\b/i, name: 'ING' },
  { re: /enpara/i, name: 'Enpara' },
  { re: /papara/i, name: 'Papara' },
  { re: /tosla/i, name: 'Tosla' },
  { re: /kuveyt\s*t[uü]rk/i, name: 'Kuveyt Türk' },
  { re: /albaraka/i, name: 'Albaraka' },
  { re: /fibabanka|fiba\s*bank/i, name: 'Fibabanka' },
  { re: /şekerbank|sekerbank/i, name: 'Şekerbank' },
  { re: /odeabank|odea\s*bank/i, name: 'Odeabank' },
  { re: /world\s*card|\bworld\b/i, name: 'World (Yapı Kredi)' },
  { re: /\bbonus\b/i, name: 'Bonus (Garanti)' },
  { re: /\bmaximum\b/i, name: 'Maximum (İş Bankası)' },
  { re: /\baxess\b/i, name: 'Axess (Akbank)' },
  { re: /bankkart|bank\s*kart/i, name: 'Bankkart (Ziraat)' },
  { re: /\bparaf\b/i, name: 'Paraf (Halkbank)' },
  { re: /\btroy\b/i, name: 'TROY' },
];

type TotalCandidate = {
  amount: number;
  score: number;
  tag: string;
};

export function roundKurus(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parsePosMoney(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  let s = raw
    .trim()
    // Silik / yarım kalan rakam OCR hataları
    .replace(/(\d)[OoQ](\d)/g, '$10$2')
    .replace(/(\d)[lI|!](\d)/g, '$11$2')
    .replace(/(\d)[Ss\$](\d)/g, '$15$2')
    .replace(/(\d)[Bb](\d)/g, '$18$2')
    .replace(/(\d)[Zz](\d)/g, '$12$2')
    .replace(/(\d)[Gg](\d)/g, '$19$2')
    .replace(/(\d)[Dd](\d)/g, '$10$2')
    .replace(/(\d)[Aa](\d)/g, '$14$2')
    .replace(/(\d)\s+(\d)/g, '$1$2')
    .replace(/\s/g, '')
    .replace(/^\*+/, '')
    .replace(/[^\d,.-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return null;
  const neg = s.startsWith('-');
  s = s.replace(/^-/, '');

  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length === 2) s = parts[0].replace(/\./g, '') + '.' + parts[1];
    else if (parts.length === 2 && parts[1].length === 1) s = parts[0].replace(/\./g, '') + '.' + parts[1] + '0';
    else if (parts.length === 2 && parts[1].length === 3) s = parts[0].replace(/\./g, '') + '.' + parts[1].slice(0, 2);
    else s = s.replace(/\./g, '').replace(',', '.');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '');
  } else if (s.includes('.') && /^\d+\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, '');
  } else if (s.includes('.') && /^\d+\.\d{1}$/.test(s)) {
    s = s + '0';
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundKurus(neg ? -n : n);
}

function hasKurus(raw: string): boolean {
  return /,\d{2}\b|\.\d{2}\b/.test(raw);
}

function isLikelyNonMoney(amount: number, raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 11) return true;
  if (/^\d{8}$/.test(digits) && amount >= 1_000_000) return true;
  if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(raw.trim())) return true;
  if (/^\d{1,2}:\d{2}/.test(raw.trim())) return true;
  // 290726 / 29.07.26 gibi tarih kalıntıları
  if (/^\d{6,8}$/.test(digits) && (amount >= 100000 || /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(raw.trim()))) {
    return true;
  }
  if (amount >= 100_000 && !hasKurus(raw) && !/(?:TL|TRY|₺)/i.test(raw)) return true;
  return false;
}

function normalizeTotalLine(line: string): string {
  return line
    .replace(/\bT0PLAM\b/gi, 'TOPLAM')
    .replace(/\bTOFLAM\b/gi, 'TOPLAM')
    .replace(/\bTOPIAM\b/gi, 'TOPLAM')
    .replace(/\bTOP1AM\b/gi, 'TOPLAM')
    .replace(/\bTOPLAN\b/gi, 'TOPLAM')
    .replace(/\bTOPLAMI\b/gi, 'TOPLAM')
    .replace(/\bTOP\.?\s*LAM\b/gi, 'TOPLAM')
    .replace(/\bTOPLAM\b/gi, 'TOPLAM')
    .replace(/\bODENECEK\b/gi, 'ÖDENECEK')
    .replace(/\bODENEGEK\b/gi, 'ÖDENECEK')
    .replace(/\bODENFCEK\b/gi, 'ÖDENECEK')
    .replace(/\bGENELT0PLAM\b/gi, 'GENEL TOPLAM')
    .replace(/\bGENELTOPLAM\b/gi, 'GENEL TOPLAM')
    .replace(/\bSAT[İI1][ŞS5]TUTARI?\b/gi, 'SATIS TUTARI')
    .replace(/\bSAT[İI1][ŞS5]\s*TUTAR[İI1]?\b/gi, 'SATIS TUTARI')
    .replace(/\b[İI][ŞS]LEMTUTARI?\b/gi, 'ISLEM TUTARI')
    .replace(/\b[İI][ŞS]LEM\s*TUTAR[İI]?\b/gi, 'ISLEM TUTARI')
    .replace(/\bM[ÜU][ŞS]TER[İI]\b/gi, 'MUSTERI')
    .replace(
      /\b(TOPLAM|ÖDENECEK|ODENECEK|GENEL\s*TOPLAM|SATIS\s*TUTARI?|ISLEM\s*TUTARI?|TUTAR)(?=[\d*])/gi,
      '$1 '
    )
    .replace(/(\d)[OoQ](\d)/g, '$10$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Satırdaki para tutarları — fiş no / VKN / tarih filtreli */
export function amountsOnLine(line: string): number[] {
  const cleaned = line.replace(/[OoQ]/g, '0');
  const out: number[] = [];

  const push = (raw: string) => {
    const n = parsePosMoney(raw);
    if (n != null && n >= 0.01 && n < 5_000_000 && !isLikelyNonMoney(n, raw)) out.push(n);
  };

  // TL soneki — en güvenilir
  for (const m of cleaned.matchAll(/([\d][\d\s.,]*)\s*(?:TL|TRY|₺)/gi)) {
    push(m[1]);
  }
  if (out.length) return out;

  // KDV %10 636,36 → sadece yüzde sonrası tutar
  if (/kdv\s*%/i.test(cleaned)) {
    const afterPct = cleaned.replace(/^.*?kdv\s*%\s*\d{1,2}\s*/i, '');
    for (const m of afterPct.matchAll(/(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})/g)) {
      push(m[1]);
    }
    if (out.length) return out;
  }

  // Türk formatı: nokta binlik (1.234,56) veya düz ondalık (636,36)
  for (const m of cleaned.matchAll(/(\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,7},\d{2}|\d+\.\d{2})/g)) {
    const raw = m[1];
    // "10 636,36" gibi KDV satırı birleşmelerini ele
    if (/^\d{1,2},\d{2}$/.test(raw.replace(/\./g, ''))) continue;
    push(raw);
  }
  if (out.length) return out;

  // Son çare: 3+ haneli tamsayı (fiş no değilse)
  for (const m of cleaned.matchAll(/\b(\d{3,7})\b/g)) {
    const raw = m[1];
    if (/^\d{4}$/.test(raw) && !/(?:TL|TRY|₺|toplam|tutar)/i.test(cleaned)) continue;
    push(raw);
  }
  return out;
}

function isLabelOnlyLine(line: string): boolean {
  const stripped = line.replace(/[:.#\-–—*]/g, ' ').trim();
  if (!LABEL_AMOUNT.test(stripped)) return false;
  return amountsOnLine(line).length === 0;
}

function amountAfterLabel(line: string): number | null {
  const m = line.match(LABEL_AMOUNT);
  if (!m || m.index == null) return null;
  const after = line.slice(m.index + m[0].length).replace(/^[:.#\-\s]+/, '');
  const amts = amountsOnLine(after);
  if (!amts.length) return null;
  return amts[amts.length - 1];
}

/** Etiketten önce gelen tutar: "7.000,50 TL GENEL TOPLAM" */
function amountBeforeLabel(line: string): number | null {
  if (!LABEL_AMOUNT.test(line)) return null;
  const m = line.match(LABEL_AMOUNT);
  if (!m || m.index == null || m.index < 3) return null;
  const before = line.slice(0, m.index).trim();
  const amts = amountsOnLine(before);
  if (!amts.length) return null;
  return amts[amts.length - 1];
}

/** Etiketli satırdaki en güvenilir tutar (sonra / sağda / TL'li) */
function amountForLabelLine(line: string): number | null {
  const after = amountAfterLabel(line);
  if (after != null) return after;
  const before = amountBeforeLabel(line);
  if (before != null) return before;
  if (!LABEL_AMOUNT.test(line)) return null;
  const all = amountsOnLine(line);
  if (!all.length) return null;
  if (/(?:TL|TRY|₺)/i.test(line)) return all[all.length - 1];
  const kurus = all.filter((a) => !Number.isInteger(a));
  if (kurus.length) return kurus[kurus.length - 1];
  return all[all.length - 1];
}

function amountOnNearbyLines(lines: string[], i: number): number | null {
  for (const j of [i + 1, i + 2]) {
    if (j >= lines.length) break;
    const next = lines[j];
    if (PERSON_LINE.test(next) || DATE_LINE.test(next)) continue;
    if (NOT_TOTAL.test(next)) continue;
    if (/^(?:kdv|matrah|ara|iskonto|indirim|banka|kart|visa|master|troy|onay|provizyon|terminal|musteri|isyeri)/i.test(next)) {
      continue;
    }
    if (BANK_SALE_LABEL.test(next) && amountsOnLine(next).length === 0) continue;
    if (STRONG_TOTAL.test(next) && amountsOnLine(next).length === 0) continue;
    const amts = amountsOnLine(next);
    if (!amts.length) continue;
    // Tercih: kuruşlu / TL'li
    const preferred =
      amts.filter((a) => !Number.isInteger(a)).pop() ??
      (/(?:TL|TRY|₺)/i.test(next) ? amts[amts.length - 1] : null) ??
      amts[amts.length - 1];
    if (preferred != null && preferred >= 0.01) return preferred;
  }
  return null;
}

function amountOnNextLine(lines: string[], i: number): number | null {
  return amountOnNearbyLines(lines, i);
}

/**
 * Banka POS slip: SATIŞ TUTARI / İŞLEM TUTARI satırını önce yakala.
 * Müşteri adı ve tarih satırları yok sayılır.
 */
function extractBankSlipSaleTotal(lines: string[]): number | null {
  let best: { amount: number; score: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (PERSON_LINE.test(line) || DATE_LINE.test(line)) continue;
    if (NOT_TOTAL.test(line)) continue;

    const isSale = BANK_SALE_LABEL.test(line);
    const isToplam =
      /(?:^|[^a-zçğıöşü0-9])(?:genel\s*)?t[o0]plam(?:\s*tutar)?(?=\s|$|[:.*₺]|\d)/i.test(line) &&
      !/ara\s*t[o0]plam/i.test(line);
    const isOdenecek = /(?:ö|o)denecek/i.test(line);
    const isBareTutar =
      /(?:^|[^a-zçğıöşü])tutar\s*[:.]/i.test(line) && !BANK_SALE_LABEL.test(line) && !isToplam;

    if (!isSale && !isToplam && !isOdenecek && !isBareTutar) continue;

    let amount = amountForLabelLine(line);
    let fromNext = false;
    if (amount == null) {
      amount = amountOnNearbyLines(lines, i);
      fromNext = amount != null;
    }
    if (amount == null || amount < 0.01) continue;

    let score = isSale ? 400 : isOdenecek ? 360 : isToplam ? 340 : 220;
    if (fromNext) score += 20;
    if (!Number.isInteger(amount)) score += 40;
    if (/(?:TL|TRY|₺)/i.test(line) || (fromNext && i + 1 < lines.length && /(?:TL|TRY|₺)/i.test(lines[i + 1]))) {
      score += 30;
    }
    // Fişin alt / orta bölümündeki tutarlar daha güvenilir
    if (i >= lines.length * 0.25) score += 25;
    if (i >= lines.length * 0.45) score += 15;

    if (!best || score > best.score) best = { amount: roundKurus(amount), score };
  }

  return best?.amount ?? null;
}

function extractMatrahKdv(lines: string[]): { matrah: number | null; kdv: number | null; inclusive: number | null } {
  let matrah: number | null = null;
  let kdv: number | null = null;

  for (const line of lines) {
    const n = normalizeTotalLine(line);
    if (/^matrah\b|matrah\s*[:.]|\bara\s*t[o0]plam\b/i.test(n) && !/kdv\s*%|%\s*\d|dahil/i.test(n)) {
      const a = amountsOnLine(n);
      if (a.length) {
        const v = a[a.length - 1];
        if (matrah == null || v > matrah) matrah = v;
      }
    }
    if (/^kdv\b|kdv\s*%|kdv\s*tut/i.test(n) && !/dahil|toplam\s*kdv|genel/i.test(n)) {
      const a = amountsOnLine(n);
      if (a.length) {
        const v = a[a.length - 1];
        if (v < 500_000 && (kdv == null || v > kdv)) kdv = v;
      }
    }
  }

  if (matrah != null && kdv != null && matrah > 0 && kdv > 0 && matrah > kdv) {
    const inc = roundKurus(matrah + kdv);
    const ratio = kdv / matrah;
    if (ratio >= 0.01 && ratio <= 0.25) {
      return { matrah, kdv, inclusive: inc };
    }
  }
  return { matrah, kdv, inclusive: null };
}

function addCandidate(list: TotalCandidate[], amount: number, score: number, tag: string) {
  const a = roundKurus(amount);
  if (!(a > 0)) return;
  const existing = list.find((c) => Math.abs(c.amount - a) < 0.005);
  if (existing) {
    existing.score += score;
    existing.tag += `+${tag}`;
  } else {
    list.push({ amount: a, score, tag });
  }
}

function extractConsensus(lines: string[]): Map<number, number> {
  const votes = new Map<number, number>();
  const start = Math.floor(lines.length * 0.35);
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (PERSON_LINE.test(line) || DATE_LINE.test(line)) continue;
    const hasTl = /(?:TL|TRY|₺)/i.test(line);
    const hasLabel = STRONG_TOTAL.test(line) || WEAK_TOTAL.test(line) || BANK_SALE_LABEL.test(line);
    if (!hasTl && !hasLabel) continue;
    if (NOT_TOTAL.test(line) && !hasLabel && !hasTl) continue;
    for (const a of amountsOnLine(line)) {
      votes.set(a, (votes.get(a) ?? 0) + 1);
    }
  }
  return votes;
}

/** Alt bölümde sadece tutar + TL satırı */
function extractStandaloneTlTotal(lines: string[]): number | null {
  const start = Math.floor(lines.length * 0.5);
  let best: { amount: number; score: number } | null = null;
  for (let i = lines.length - 1; i >= start; i--) {
    const line = lines[i];
    if (!/(?:TL|TRY|₺)/i.test(line)) continue;
    if (/kdv|matrah|ara\s*t[o0]plam|iskonto|indirim/i.test(line) && !STRONG_TOTAL.test(line)) continue;
    const amts = amountsOnLine(line);
    if (!amts.length) continue;
    const a = amts[amts.length - 1];
    let score = i + 40;
    if (hasKurus(line)) score += 30;
    if (STRONG_TOTAL.test(line)) score += 50;
    if (!best || score > best.score) best = { amount: a, score };
  }
  return best?.amount ?? null;
}

/**
 * Fiş tutarı — kesin öncelik:
 * 0) Banka POS: SATIŞ TUTARI / İŞLEM TUTARI / TOPLAM
 * 1) ÖDENECEK / GENEL TOPLAM (aynı satır veya hemen alt satır)
 * 2) Matrah + KDV = inclusive çapraz doğrulama
 * 3) Aynı tutarın fiş altında tekrarı (oy)
 */
export function extractReceiptTotal(lines: string[]): number | null {
  const expanded = expandReceiptOcrLines(lines);
  const norm = expanded.map(normalizeTotalLine);
  const candidates: TotalCandidate[] = [];
  const mk = extractMatrahKdv(norm);
  const consensus = extractConsensus(norm);

  // Banka slip satış tutarı — müşteri adından bağımsız, en yüksek öncelik
  const bankSale = extractBankSlipSaleTotal(norm);
  if (bankSale != null) {
    addCandidate(candidates, bankSale, 500, 'bank-sale');
  }

  for (let i = 0; i < norm.length; i++) {
    const line = norm[i];
    if (PERSON_LINE.test(line) || DATE_LINE.test(line)) continue;
    // Ara toplam / KDV satırları asla fiş tutarı olmasın (STRONG override yok)
    if (NOT_TOTAL.test(line)) continue;

    const strong = STRONG_TOTAL.test(line) || BANK_SALE_LABEL.test(line);
    const weak = WEAK_TOTAL.test(line);
    if (!strong && !weak) continue;

    let amount: number | null = amountForLabelLine(line);
    let source = 'same-line';

    if (amount == null && (isLabelOnlyLine(line) || strong || BANK_SALE_LABEL.test(line))) {
      amount = amountOnNearbyLines(norm, i);
      source = 'next-line';
    }

    if (amount == null) continue;

    let score = strong ? 200 : 80;
    if (source === 'next-line' && strong) score += 30;
    if (BANK_SALE_LABEL.test(line)) score += 120;
    if (/(?:ö|o)denecek/i.test(line)) score += 55;
    if (/genel\s*t[o0]plam/i.test(line)) score += 50;
    // Düz TOPLAM ≈ SATIŞ TUTARI kadar güvenilir (ara-toplam zaten elendi)
    if (/(?:^|[^a-zçğıöşü0-9])t[o0]plam(?:\s*tutar)?(?=\s|$|[:.*₺]|\d)/i.test(line)) score += 55;
    if (/[iı][sş]lem\s*tutar|islem\s*tutar|sat[iı][sş]\s*tutar/i.test(line)) score += 70;
    if (/karttan\s*[cç]ekilen|tahsil\s*edilen/i.test(line)) score += 40;
    if (/(?:TL|TRY|₺)/i.test(line)) score += 25;
    if (source === 'next-line' && i + 1 < norm.length && /(?:TL|TRY|₺)/i.test(norm[i + 1])) {
      score += 25;
    }
    if (hasKurus(line) || (source === 'next-line' && i + 1 < norm.length && hasKurus(norm[i + 1]))) {
      score += 35;
    }
    if (!Number.isInteger(amount)) score += 35;
    if (i >= norm.length * 0.45) score += 35;
    if (i >= norm.length * 0.65) score += 20;

    const votes = consensus.get(amount) ?? 0;
    if (votes >= 2) score += 45 * (votes - 1);
    if (votes >= 3) score += 35;

    if (mk.inclusive != null && Math.abs(amount - mk.inclusive) < 0.02) score += 120;
    if (mk.matrah != null && Math.abs(amount - mk.matrah) < 0.02 && mk.inclusive != null) score -= 150;
    if (mk.kdv != null && Math.abs(amount - mk.kdv) < 0.02) score -= 120;
    if (
      weak &&
      /tutar\s*[:.]/i.test(line) &&
      !/(?:toplam|odenecek|ödenecek|islem|işlem|satis|sat[iı][sş]|genel|net|kart|tahsil)/i.test(line)
    ) {
      score -= 40;
      if (amount < 500) score -= 30;
    }

    addCandidate(candidates, amount, score, `${strong ? 'strong' : 'weak'}-${source}`);
  }

  if (mk.inclusive != null) {
    addCandidate(candidates, mk.inclusive, 110, 'matrah+kdv');
    const match = candidates.find((c) => Math.abs(c.amount - mk.inclusive!) < 0.02);
    if (match) match.score += 90;
  }

  const tlOnly = extractStandaloneTlTotal(norm);
  if (tlOnly != null) {
    let score = 70;
    if (mk.inclusive != null && Math.abs(tlOnly - mk.inclusive) < 0.02) score += 100;
    if (mk.matrah != null && Math.abs(tlOnly - mk.matrah) < 0.02) score -= 100;
    addCandidate(candidates, tlOnly, score, 'tl-only');
  }

  for (const [amount, votes] of consensus) {
    if (votes >= 2 && amount >= 1) {
      let score = 50 + votes * 25;
      if (mk.inclusive != null && Math.abs(amount - mk.inclusive) < 0.02) score += 70;
      if (mk.matrah != null && Math.abs(amount - mk.matrah) < 0.02) score -= 100;
      addCandidate(candidates, amount, score, `consensus-${votes}`);
    }
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score || b.amount - a.amount);
    let top = candidates[0];

    // Matrah+KDV biliniyorsa: etiketten gelen tutar sapıyorsa inclusive'e dön
    if (mk.inclusive != null) {
      const matched = candidates.find((c) => Math.abs(c.amount - mk.inclusive!) < 0.02);
      if (matched) {
        const drift = Math.abs(top.amount - mk.inclusive) / mk.inclusive;
        if (Math.abs(top.amount - mk.inclusive) >= 0.02 && (drift > 0.015 || top.score - matched.score < 90)) {
          top = matched;
        }
      } else if (
        mk.matrah != null &&
        (Math.abs(top.amount - mk.matrah) < 0.02 ||
          (mk.kdv != null && Math.abs(top.amount - mk.kdv) < 0.02))
      ) {
        return mk.inclusive;
      }
    }

    const runners = candidates.filter((c) => top.score - c.score <= 30);
    if (runners.length > 1) {
      runners.sort((a, b) => {
        if (mk.inclusive != null) {
          const da = Math.abs(a.amount - mk.inclusive);
          const db = Math.abs(b.amount - mk.inclusive);
          if (da < 0.02 && db >= 0.02) return -1;
          if (db < 0.02 && da >= 0.02) return 1;
        }
        const va = consensus.get(a.amount) ?? 0;
        const vb = consensus.get(b.amount) ?? 0;
        if (vb !== va) return vb - va;
        if (mk.inclusive != null) {
          const da = Math.abs(a.amount - mk.inclusive);
          const db = Math.abs(b.amount - mk.inclusive);
          if (da !== db) return da - db;
        }
        const aK = Number.isInteger(a.amount) ? 0 : 1;
        const bK = Number.isInteger(b.amount) ? 0 : 1;
        if (bK !== aK) return bK - aK;
        return b.score - a.score;
      });
      return runners[0].amount;
    }
    return top.amount;
  }

  if (mk.inclusive != null) return mk.inclusive;
  if (tlOnly != null) return tlOnly;

  let best: { amount: number; score: number } | null = null;
  const start = Math.floor(norm.length * 0.55);
  for (let i = norm.length - 1; i >= start; i--) {
    const line = norm[i];
    if (NOT_TOTAL.test(line)) continue;
    const amts = amountsOnLine(line).filter((n) => n >= 1);
    if (!amts.length) continue;
    const a = amts[amts.length - 1];
    if (mk.matrah != null && Math.abs(a - mk.matrah) < 0.02) continue;
    if (mk.kdv != null && Math.abs(a - mk.kdv) < 0.02) continue;
    let score = i + (hasKurus(line) ? 60 : 0) + (/(?:TL|TRY|₺)/i.test(line) ? 35 : 0);
    const votes = consensus.get(a) ?? 0;
    score += votes * 20;
    if (!best || score > best.score) best = { amount: roundKurus(a), score };
  }
  return best?.amount ?? null;
}

/** Matrah ile karışmış tutarı düzelt (KDV dahil olmalı) */
export function reconcileReceiptTotal(
  total: number | null,
  lines: string[]
): { total: number | null; adjusted: boolean; reason?: string } {
  const expanded = expandReceiptOcrLines(lines);
  const norm = expanded.map(normalizeTotalLine);
  const mk = extractMatrahKdv(norm);

  if (mk.inclusive != null && mk.matrah != null) {
    if (total == null) {
      return {
        total: mk.inclusive,
        adjusted: true,
        reason: 'Matrah + KDV toplamından fiş tutarı hesaplandı',
      };
    }
    if (Math.abs(total - mk.matrah) < 0.02 && Math.abs(total - mk.inclusive) >= 0.02) {
      return {
        total: mk.inclusive,
        adjusted: true,
        reason: 'Ara toplam (matrah) yerine KDV dahil tutar kullanıldı',
      };
    }
    if (mk.kdv != null && Math.abs(total - mk.kdv) < 0.02) {
      return {
        total: mk.inclusive,
        adjusted: true,
        reason: 'KDV tutarı yerine KDV dahil toplam kullanıldı',
      };
    }
    if (Math.abs(total - mk.inclusive) > 0.02 && Math.abs(total - mk.matrah) < 0.02) {
      return {
        total: mk.inclusive,
        adjusted: true,
        reason: 'Fiş tutarı matrah ile eşleşiyordu; KDV dahil toplam düzeltildi',
      };
    }
    // Okunan tutar ara toplam / matrah×1.1 gibi görünüyorsa inclusive kullan
    const drift = Math.abs(total - mk.inclusive) / mk.inclusive;
    if (drift > 0.02 && drift < 0.35) {
      const nearMatrah = Math.abs(total - mk.matrah) / mk.matrah < 0.03;
      const nearTenPct = mk.matrah > 0 && Math.abs(total / mk.matrah - 1.1) < 0.03;
      if (nearMatrah || nearTenPct) {
        return {
          total: mk.inclusive,
          adjusted: true,
          reason: 'Okunan tutar matrah+KDV ile uyuşmuyordu; düzeltilmiş toplam kullanıldı',
        };
      }
    }
  }

  if (total == null) return { total: null, adjusted: false };
  return { total, adjusted: false };
}

export function extractReceiptNo(lines: string[], joined: string): string | null {
  const normalized = joined
    .replace(/F[İI][ŞS]/gi, 'FIS')
    .replace(/f[iı][sş]/gi, 'fis');

  const patterns: RegExp[] = [
    /(?:fis|fi[sş])\s*(?:no|numarasi|numarası|numara)?\s*[:.#\-\s]*([A-Z0-9][A-Z0-9\-\/\.]{2,24})/i,
    /(?:belge\s*no|belgeno)\s*[:.#\-\s]*([A-Z0-9][A-Z0-9\-\/\.]{2,24})/i,
    /(?:z\s*no|zno)\s*[:.#\-\s]*([A-Z0-9][A-Z0-9\-\/\.]{1,16})/i,
    /(?:islem\s*no|[iı][sş]lem\s*no|i[sş]lem\s*n0|txn|receipt)\s*[:.#\-\s]*([A-Z0-9][A-Z0-9\-\/\.]{2,24})/i,
    /(?:fatura\s*no)\s*[:.#\-\s]*([A-Z0-9][A-Z0-9\-\/\.]{2,24})/i,
    /(?:e\s*c\s*r|ecr)\s*(?:no)?\s*[:.#\-\s]*([A-Z0-9][A-Z0-9\-\/\.]{2,16})/i,
  ];

  for (const re of patterns) {
    const m = normalized.match(re);
    if (m?.[1]) {
      const v = m[1].replace(/[.,]+$/, '').trim();
      if (v.length >= 2 && !RECEIPT_NO_BLACKLIST.test(v) && !BANK_NAME_ONLY.test(v)) return v;
    }
  }

  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i].replace(/F[İI][ŞS]/gi, 'FIS');
    if (!/(?:fis|belge|z\s*no|islem|[iı][sş]lem)\s*(?:no)?/i.test(line)) continue;
    const same = line.match(/[:.#]\s*([A-Z0-9][A-Z0-9\-\/\.]{2,24})\s*$/i);
    if (same?.[1]) {
      const v = same[1].trim();
      if (!BANK_NAME_ONLY.test(v) && !RECEIPT_NO_BLACKLIST.test(v)) return v;
    }
    if (i + 1 < lines.length) {
      const next = lines[i + 1].match(/^([A-Z0-9][A-Z0-9\-\/\.]{2,24})\s*$/i);
      if (next?.[1] && !/(?:tl|try|toplam)/i.test(next[1]) && !BANK_NAME_ONLY.test(next[1])) {
        return next[1].trim();
      }
    }
  }

  return null;
}

export function extractPaymentBank(joined: string, lines: string[]): string | null {
  for (const line of lines) {
    if (!/(?:banka|acquirer|kart\s*bank|üye\s*[iı][sş]yeri\s*bank|uye\s*isyeri\s*bank|pos\s*bank)/i.test(line)) {
      continue;
    }
    for (const b of BANKS) {
      if (b.re.test(line)) return b.name;
    }
  }
  for (const b of BANKS) {
    if (b.re.test(joined)) return b.name;
  }
  return null;
}

export function extractPaymentMethod(joined: string): string | null {
  if (/(?:kart|card|pos|kk|kredi\s*kart|banka\s*kart|visa|mastercard|troy|temass[ıi]z)/i.test(joined)) {
    return 'Kart / POS';
  }
  if (/(?:nakit|cash|pe[sş]in)/i.test(joined)) return 'Nakit';
  if (/havale|eft|transfer/i.test(joined)) return 'Havale / EFT';
  return null;
}

export function amountsOnLineExport(line: string): number[] {
  return amountsOnLine(line);
}
