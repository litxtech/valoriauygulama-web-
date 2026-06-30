import type { ParsedBankLine, ParsedBankStatement } from '@/lib/bankStatement/types';
import {
  buildDedupKey,
  extractIbanFromText,
  extractNameFromNarrative,
  extractTaxIdFromText,
  normalizeIban,
} from '@/lib/bankStatement/normalize';

type Mt940Tag = { tag: string; value: string };

function splitMt940Tags(content: string): Mt940Tag[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const tags: Mt940Tag[] = [];
  const re = /:([0-9]{2}[A-Z]?):/g;
  let match: RegExpExecArray | null;
  const starts: { tag: string; index: number; valueStart: number }[] = [];

  while ((match = re.exec(normalized)) !== null) {
    starts.push({ tag: match[1], index: match.index, valueStart: match.index + match[0].length });
  }

  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].index : normalized.length;
    let value = normalized.slice(starts[i].valueStart, end);
    value = value.replace(/\n+$/, '').replace(/\n/g, '');
    tags.push({ tag: starts[i].tag, value });
  }
  return tags;
}

function parseMt940Date(yyMmDd: string): string | null {
  if (!/^\d{6}$/.test(yyMmDd)) return null;
  const yy = parseInt(yyMmDd.slice(0, 2), 10);
  const mm = yyMmDd.slice(2, 4);
  const dd = yyMmDd.slice(4, 6);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return `${year}-${mm}-${dd}`;
}

function parseMt940Amount(raw: string): number | null {
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function parse61Line(line61: string): {
  valueDate: string | null;
  direction: 'credit' | 'debit' | null;
  amount: number | null;
  bankReference: string | null;
} {
  const dateMatch = line61.match(/^(\d{6})/);
  const valueDate = dateMatch ? parseMt940Date(dateMatch[1]) : null;

  let rest = line61.slice(dateMatch?.[0]?.length ?? 0);
  if (/^\d{4}/.test(rest)) rest = rest.slice(4);

  const dirMatch = rest.match(/^([RC]?(?:C|D))/);
  if (!dirMatch) return { valueDate, direction: null, amount: null, bankReference: null };
  const dirChar = dirMatch[1].replace(/^R/, '');
  const direction = dirChar === 'C' ? 'credit' : 'debit';
  rest = rest.slice(dirMatch[0].length);

  const amountMatch = rest.match(/^([0-9]+[,.]?[0-9]*)/);
  const amount = amountMatch ? parseMt940Amount(amountMatch[1]) : null;

  const refMatch = line61.match(/\/\/([^/\s]+)/);
  const bankReference = refMatch?.[1]?.trim() ?? null;

  return { valueDate, direction, amount, bankReference };
}

function enrichLine(
  line61: string,
  narrative: string,
  bankCode: string,
  accountIban: string | null,
  index: number
): ParsedBankLine | null {
  const parsed = parse61Line(line61);
  if (!parsed.valueDate || !parsed.direction || !parsed.amount) return null;

  const iban = extractIbanFromText(narrative) ?? extractIbanFromText(line61);
  const taxId = extractTaxIdFromText(narrative) ?? extractTaxIdFromText(line61);
  const name = extractNameFromNarrative(narrative, iban, taxId);
  const description = narrative.trim() || line61.trim();

  const dedupKey = buildDedupKey({
    accountIban,
    valueDate: parsed.valueDate,
    valueTime: extractTimeFromNarrative(narrative),
    direction: parsed.direction,
    amount: parsed.amount,
    bankReference: parsed.bankReference,
    description,
  });

  return {
    localId: `mt940-${index}`,
    valueDate: parsed.valueDate,
    valueTime: extractTimeFromNarrative(narrative),
    direction: parsed.direction,
    amount: parsed.amount,
    currency: 'TRY',
    description,
    counterpartyNameRaw: name,
    counterpartyIban: iban,
    counterpartyTaxId: taxId,
    bankReference: parsed.bankReference,
    rawLine61: line61,
    rawLine86: narrative,
    dedupKey,
  };
}

export function parseMt940(content: string, bankCode: string): ParsedBankStatement {
  const tags = splitMt940Tags(content);
  let accountIban: string | null = null;
  const lines: ParsedBankLine[] = [];
  let lineIndex = 0;

  for (let i = 0; i < tags.length; i++) {
    const { tag, value } = tags[i];
    if (tag === '25') {
      accountIban = extractIbanFromText(value) ?? normalizeIban(value) ?? accountIban;
    }
    if (tag !== '61') continue;

    let narrative = '';
    if (i + 1 < tags.length && tags[i + 1].tag === '86') {
      narrative = tags[i + 1].value;
      i += 1;
    }

    const line = enrichLine(value, narrative, bankCode, accountIban, lineIndex++);
    if (line) lines.push(line);
  }

  return { format: 'mt940', accountIban, lines };
}

function extractTimeFromNarrative(narrative: string): string | null {
  const m =
    narrative.match(/\b([01]\d|2[0-3])[:.]([0-5]\d)(?::([0-5]\d))?/) ??
    narrative.match(/\b([01]\d)([0-5]\d)(?:([0-5]\d))?\b/);
  if (!m) return null;
  const hh = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  const ss = (m[3] ?? '00').padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function looksLikeMt940(content: string): boolean {
  const head = content.slice(0, 2000);
  return /:20:/.test(head) && /:61:/.test(head) && (/:86:/.test(head) || /:62[FML]?:/.test(head));
}
