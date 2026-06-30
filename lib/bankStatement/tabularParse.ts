import type { BankCode, ParsedBankLine, ParsedBankStatement } from '@/lib/bankStatement/types';
import {
  buildDedupKey,
  extractIbanFromText,
  extractNameFromNarrative,
  extractTaxIdFromText,
} from '@/lib/bankStatement/normalize';
import { parseCurrencyCode, parseStatementAmount, parseStatementDate } from '@/lib/bankStatement/dateAmount';
import { isColumnMapSufficient, type TabularColumnMap } from '@/lib/bankStatement/columnMap';
import { pickBestHeaderAndMap } from '@/lib/bankStatement/bankProfiles';
import { isJunkCounterpartyValue, isBankFeeOrJunkName, isMetadataRow, rowHasValidTransaction } from '@/lib/bankStatement/tablePrep';

export type TabularParseResult = ParsedBankStatement & {
  headers: string[];
  columnMap: TabularColumnMap;
  needsColumnMapping: boolean;
};

function cell(row: string[], idx: number | undefined): string {
  if (idx == null || idx < 0) return '';
  return (row[idx] ?? '').trim();
}

function isGenericType(typeCol: string): boolean {
  return /^(eft|fast|havale|transfer|pos|ücret|ucret|komisyon|nakit|kart)$/i.test(typeCol.trim());
}

function composeDescription(desc: string, counterparty: string, typeCol: string): string {
  const parts: string[] = [];
  if (counterparty && !isJunkCounterpartyValue(counterparty)) parts.push(counterparty);
  if (desc && !isJunkCounterpartyValue(desc)) parts.push(desc);
  if (typeCol && !isGenericType(typeCol) && !isJunkCounterpartyValue(typeCol)) parts.push(typeCol);
  if (parts.length) return parts.join(' — ');
  return desc || counterparty || typeCol || '';
}

function resolveCounterpartyName(
  counterparty: string,
  desc: string,
  fullDescription: string,
  iban: string | null,
  taxId: string | null
): string | null {
  if (counterparty && !isJunkCounterpartyValue(counterparty) && !isBankFeeOrJunkName(counterparty))
    return counterparty.trim();
  const fromDesc = extractNameFromNarrative(desc, iban, taxId);
  if (fromDesc && !isJunkCounterpartyValue(fromDesc) && !isBankFeeOrJunkName(fromDesc)) return fromDesc;
  const fromFull = extractNameFromNarrative(fullDescription, iban, taxId);
  if (fromFull && !isJunkCounterpartyValue(fromFull) && !isBankFeeOrJunkName(fromFull)) return fromFull;
  return null;
}

function buildLineFromRow(
  row: string[],
  map: TabularColumnMap,
  bankCode: string,
  accountIban: string | null,
  index: number,
  format: ParsedBankStatement['format']
): ParsedBankLine | null {
  if (!rowHasValidTransaction(row, map)) return null;

  const dateRaw = cell(row, map.date);
  const { date: valueDate, time: valueTime } = parseStatementDate(dateRaw);
  if (!valueDate) return null;

  const desc = cell(row, map.description);
  const counterparty = cell(row, map.counterparty);
  const typeCol = cell(row, map.type);
  const description = composeDescription(desc, counterparty, typeCol);
  if (!description || isJunkCounterpartyValue(description)) return null;

  let signed: number | null = null;
  if (map.amount != null) {
    signed = parseStatementAmount(cell(row, map.amount));
  } else {
    const debit = map.debit != null ? parseStatementAmount(cell(row, map.debit)) : null;
    const credit = map.credit != null ? parseStatementAmount(cell(row, map.credit)) : null;
    if (debit) signed = -Math.abs(debit);
    else if (credit) signed = Math.abs(credit);
  }
  if (signed == null || signed === 0) return null;

  const direction = signed > 0 ? 'credit' : 'debit';
  const amount = Math.abs(signed);

  const ibanCol = cell(row, map.iban);
  const iban =
    extractIbanFromText(ibanCol) ?? extractIbanFromText(description) ?? extractIbanFromText(row.join(' '));
  const taxId = extractTaxIdFromText(description) ?? extractTaxIdFromText(row.join(' '));
  const name = resolveCounterpartyName(counterparty, desc, description, iban, taxId);

  const currencyRaw = cell(row, map.currency) || description;
  const currency = parseCurrencyCode(currencyRaw);
  const bankReference = cell(row, map.reference) || null;

  const dedupKey = buildDedupKey({
    accountIban,
    valueDate,
    valueTime,
    direction,
    amount,
    bankReference,
    description,
  });

  return {
    localId: `${format}-${index}`,
    valueDate,
    valueTime,
    direction,
    amount,
    currency,
    description,
    counterpartyNameRaw: name,
    counterpartyIban: iban,
    counterpartyTaxId: taxId,
    bankReference,
    rawLine61: null,
    rawLine86: row.join(' | '),
    dedupKey,
  };
}

export function parseTabularRows(
  rows: string[][],
  bankCode: BankCode,
  format: ParsedBankStatement['format'],
  userMap?: TabularColumnMap
): TabularParseResult {
  const { headers, dataRows, columnMap, accountIban } = pickBestHeaderAndMap(rows, bankCode, userMap);
  const sufficient = isColumnMapSufficient(columnMap);

  if (!headers.length) {
    return {
      format,
      accountIban,
      lines: [],
      headers: [],
      columnMap: {},
      needsColumnMapping: true,
    };
  }

  if (!sufficient && !userMap) {
    return { format, accountIban, lines: [], headers, columnMap, needsColumnMapping: true };
  }

  const lines: ParsedBankLine[] = [];
  let index = 0;
  for (const row of dataRows) {
    if (!row.length || row.every((c) => !c.trim()) || isMetadataRow(row)) continue;
    const line = buildLineFromRow(row, columnMap, bankCode, accountIban, index++, format);
    if (line) lines.push(line);
  }

  return {
    format,
    accountIban,
    lines,
    headers,
    columnMap,
    needsColumnMapping: lines.length === 0 && headers.length > 0 && !userMap,
  };
}

export function parseCsvContent(
  content: string,
  bankCode: BankCode,
  userMap?: TabularColumnMap
): TabularParseResult {
  const rows = parseCsvRows(content);
  return parseTabularRows(rows, bankCode, 'csv', userMap);
}

export function parseCsvRows(content: string): string[][] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const delim = detectDelimiter(lines[0]);
  return lines.map((line) => parseCsvLine(line, delim));
}

function detectDelimiter(line: string): string {
  const semicolons = (line.match(/;/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  const tabs = (line.match(/\t/g) ?? []).length;
  if (tabs >= semicolons && tabs >= commas) return '\t';
  if (semicolons >= commas) return ';';
  return ',';
}

function parseCsvLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delim) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

export function looksLikeTabularText(content: string): boolean {
  const head = content.slice(0, 2000).toLowerCase();
  if (/:20:/.test(content.slice(0, 500))) return false;
  const hasDate = ['tarih', 'date', 'posted', 'booking', 'işlem tarihi', 'islem tarihi'].some((h) =>
    head.includes(h)
  );
  const hasMoney = ['tutar', 'amount', 'borç', 'borc', 'alacak', 'debit', 'credit', 'balance', 'bakiye'].some((h) =>
    head.includes(h)
  );
  return hasDate && hasMoney;
}
