import type { BankCode, ParsedBankLine, ParsedBankStatement } from '@/lib/bankStatement/types';
import {
  buildDedupKey,
  extractIbanFromText,
  extractNameFromNarrative,
  extractTaxIdFromText,
} from '@/lib/bankStatement/normalize';
import { isBankFeeOrJunkName } from '@/lib/bankStatement/tablePrep';
import { parseMt940, looksLikeMt940 } from '@/lib/bankStatement/mt940Parse';
import { parseBankCsv } from '@/lib/bankStatement/csvParse';

const LINE_RE =
  /(\d{1,2}[./]\d{1,2}[./]\d{2,4})\s*(?:(\d{1,2}[:.]\d{2}(?::\d{2})?)\s*)?(.*?)([-+]?\s*[\d.]+(?:,\d{2})?)\s*(?:TL|TRY|₺)?/i;

function parseTrDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = `20${yyyy}`;
  return `${yyyy}-${mm}-${dd}`;
}

function parseTrAmount(raw: string): { amount: number; direction: 'credit' | 'debit' } | null {
  const neg = raw.trim().startsWith('-');
  let s = raw.replace(/[^\d,.-]/g, '').replace(/^-/, '');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { amount: Math.round(n * 100) / 100, direction: neg ? 'debit' : 'credit' };
}

function normalizeTime(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const t = raw.replace('.', ':').trim();
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  return null;
}

export function parsePdfBankText(text: string, bankCode: BankCode): ParsedBankStatement {
  if (looksLikeMt940(text)) return parseMt940(text, bankCode);
  const csvTry = parseBankCsv(text, bankCode);
  if (csvTry.lines.length > 0) return { ...csvTry, format: 'pdf' };

  const accountIban = extractIbanFromText(text.slice(0, 3000));
  const lines: ParsedBankLine[] = [];
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let index = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const m = row.match(LINE_RE);
    if (!m) continue;
    const valueDate = parseTrDate(m[1]);
    if (!valueDate) continue;
    const parsedAmt = parseTrAmount(m[4]);
    if (!parsedAmt) continue;

    const extraParts: string[] = [];
    for (let j = i + 1; j < Math.min(i + 3, rows.length); j++) {
      const next = rows[j];
      if (LINE_RE.test(next)) break;
      if (/^(borç|borc|alacak|toplam|bakiye|devreden|tarih|açıklama|aciklama)/i.test(next)) break;
      if (next.length >= 3) extraParts.push(next);
    }

    let middle = [m[3].trim(), ...extraParts].filter(Boolean).join(' ');
    const fullRowText = [row, ...extraParts].join(' ');
    const lower = middle.toLowerCase();
    let direction = parsedAmt.direction;
    if (/\b(gelen|alacak|tahsilat|credit)\b/i.test(lower)) direction = 'credit';
    if (/\b(giden|borc|borç|odeme|ödeme|eft|havale|debit)\b/i.test(lower) && !/\bgelen\b/i.test(lower)) {
      direction = 'debit';
    }

    const iban = extractIbanFromText(fullRowText);
    const taxId = extractTaxIdFromText(fullRowText);
    let name = extractNameFromNarrative(middle, iban, taxId) ?? extractNameFromNarrative(fullRowText, iban, taxId);
    if (name && isBankFeeOrJunkName(name)) name = null;
    const description = middle || row;

    lines.push({
      localId: `pdf-${index++}`,
      valueDate,
      valueTime: normalizeTime(m[2] ?? null),
      direction,
      amount: parsedAmt.amount,
      currency: 'TRY',
      description,
      counterpartyNameRaw: name,
      counterpartyIban: iban,
      counterpartyTaxId: taxId,
      bankReference: null,
      rawLine61: null,
      rawLine86: row,
      dedupKey: buildDedupKey({
        accountIban,
        valueDate,
        valueTime: normalizeTime(m[2] ?? null),
        direction,
        amount: parsedAmt.amount,
        bankReference: null,
        description: fullRowText,
      }),
    });
  }

  return { format: 'pdf', accountIban, lines };
}
