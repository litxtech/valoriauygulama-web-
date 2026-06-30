import type { ColumnField } from '@/lib/bankStatement/columnMap';
import { headerMatchesField, normHeader } from '@/lib/bankStatement/columnMap';
import { parseStatementAmount, parseStatementDate } from '@/lib/bankStatement/dateAmount';

export { normHeader, headerMatchesField } from '@/lib/bankStatement/columnMap';

export function scoreRowAsTransactionHeader(row: string[]): number {
  let score = 0;
  let hasDate = false;
  let hasMoney = false;
  let hasDesc = false;

  for (const cell of row) {
    const h = normHeader(cell);
    if (!h) continue;

    const dateSc = headerMatchesField(cell, 'date');
    const descSc = headerMatchesField(cell, 'description');
    const debitSc = headerMatchesField(cell, 'debit');
    const creditSc = headerMatchesField(cell, 'credit');
    const amountSc = headerMatchesField(cell, 'amount');
    const cpSc = headerMatchesField(cell, 'counterparty');

    if (dateSc > 0) {
      score += dateSc;
      hasDate = true;
    }
    if (descSc > 0 || cpSc > 0) {
      score += Math.max(descSc, cpSc);
      hasDesc = true;
    }
    if (debitSc > 0 || creditSc > 0 || amountSc > 0) {
      score += Math.max(debitSc, creditSc, amountSc);
      hasMoney = true;
    }
  }

  if (!hasDate || !hasMoney) return 0;
  if (!hasDesc) score -= 20;
  return score;
}

export function findTransactionHeaderIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 50);
  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    if (!row?.length) continue;
    const score = scoreRowAsTransactionHeader(row);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0 && bestScore >= 120) return bestIdx;
  return bestIdx >= 0 && bestScore >= 80 ? bestIdx : 0;
}

const METADATA_ROW_PATTERNS = [
  /^hesap\s*(özeti|ozeti|no|numara)/i,
  /^şube\s*:/i,
  /^sube\s*:/i,
  /^iban\s*:/i,
  /^müşteri\s*(no|adı|adi)/i,
  /^musteri\s*(no|adi)/i,
  /^döviz\s*cinsi/i,
  /^doviz\s*cinsi/i,
  /^hesap\s*hareketleri$/i,
  /^ekstre$/i,
  /^tarih\s*aralığı/i,
  /^tarih\s*araligi/i,
  /^başlangıç\s*bakiye/i,
  /^baslangic\s*bakiye/i,
  /^son\s*bakiye/i,
  /^toplam\b/i,
  /^devreden\b/i,
  /^özet\b/i,
  /^ozet\b/i,
];

const JUNK_VALUE_PATTERNS = [
  /^şube(\s+\d+)?$/i,
  /^sube(\s+\d+)?$/i,
  /^şube\s*adı$/i,
  /^sube\s*adi$/i,
  /^hesap\s*no$/i,
  /^müşteri\s*no$/i,
  /^musteri\s*no$/i,
  /^döviz\s*cinsi$/i,
  /^doviz\s*cinsi$/i,
  /^kanal$/i,
  /^toplam$/i,
  /^devreden$/i,
  /^bakiye$/i,
  /^açıklama$/i,
  /^aciklama$/i,
  /^tarih$/i,
  /^tutar$/i,
  /^borç$/i,
  /^borc$/i,
  /^alacak$/i,
  /^\d{1,4}$/,
  /^eft\s*(ucret|ücret|masraf)?$/i,
  /^fast\s*(ucret|ücret|masraf)?$/i,
  /^havale\s*(ucret|ücret|masraf)?$/i,
  /^(komisyon|ucret|ücret|masraf|bsmv|pos\s*komisyon|banka\s*masraf|hesap\s*isletim|hesap\s*işletim)$/i,
  /^para\s*transfer(i)?\s*(ucret|ücret|masraf)?$/i,
  /^islem\s*(ucret|ücret|masraf)?$/i,
  /^islem\s*bedeli$/i,
];

/** Banka masraf / EFT-FAST ücret satırı — cari adı sayılmaz */
export function isBankFeeOrJunkName(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  const s = value.trim();
  if (isJunkCounterpartyValue(s)) return true;
  if (
    /^(eft|fast|havale|transfer|wire|swift|pos|atm|nakit|kart)(\s+(ucret|ücret|masraf|komisyon|bedeli|tahsilat|islem|işlem))*$/i.test(
      s
    )
  ) {
    return true;
  }
  if (/\b(komisyon|bsmv|masraf|ucret|ücret|bedel)\b/i.test(s) && s.length < 28 && !/\b(ltd|a\.?\s*ş|san|tic)\b/i.test(s)) {
    return true;
  }
  return false;
}

export function isJunkCounterpartyValue(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  const s = value.trim();
  if (s.length < 2) return true;
  for (const p of JUNK_VALUE_PATTERNS) {
    if (p.test(s)) return true;
  }
  return false;
}

export function isMetadataRow(row: string[]): boolean {
  const joined = row.map((c) => c.trim()).filter(Boolean).join(' ');
  if (!joined) return true;
  if (row.filter((c) => c.trim()).length <= 1) return true;

  const first = (row[0] ?? '').trim();
  for (const p of METADATA_ROW_PATTERNS) {
    if (p.test(first) || p.test(joined)) return true;
  }

  const lower = joined.toLowerCase();
  if (lower.includes('şube kodu') && !lower.includes('tarih') && row.length <= 4) return true;
  if (lower.includes('sube kodu') && !lower.includes('tarih') && row.length <= 4) return true;

  return false;
}

export function extractAccountMeta(rows: string[][]): {
  accountIban: string | null;
  branchName: string | null;
  accountNo: string | null;
} {
  let accountIban: string | null = null;
  let branchName: string | null = null;
  let accountNo: string | null = null;

  for (const row of rows.slice(0, 25)) {
    const text = row.join(' ');
    const iban = text.replace(/\s+/g, '').match(/TR\d{24}/i)?.[0];
    if (iban && !accountIban) accountIban = iban.toUpperCase();

    const first = normHeader(row[0] ?? '');
    const second = (row[1] ?? '').trim();

    if ((first.includes('şube') || first.includes('sube')) && second && second.length > 1) {
      branchName = second;
    }
    if (first.includes('hesap') && first.includes('no') && second) {
      accountNo = second;
    }
    if (/^iban/.test(first) && second) {
      accountIban = second.replace(/\s+/g, '').toUpperCase();
    }
  }

  return { accountIban, branchName, accountNo };
}

export function prepareTabularRows(rawRows: string[][]): {
  headers: string[];
  dataRows: string[][];
  headerIndex: number;
  accountIban: string | null;
} {
  const nonEmpty = rawRows.filter((r) => r.some((c) => c.trim()));
  if (!nonEmpty.length) {
    return { headers: [], dataRows: [], headerIndex: 0, accountIban: null };
  }

  const meta = extractAccountMeta(nonEmpty);
  const headerIndex = findTransactionHeaderIndex(nonEmpty);
  const headers = nonEmpty[headerIndex] ?? [];
  const dataRows = nonEmpty.slice(headerIndex + 1).filter((r) => !isMetadataRow(r));

  return {
    headers,
    dataRows,
    headerIndex,
    accountIban: meta.accountIban,
  };
}

export function rowHasValidTransaction(
  row: string[],
  map: Partial<Record<ColumnField, number>>
): boolean {
  const cell = (field: ColumnField) => {
    const idx = map[field];
    if (idx == null || idx < 0) return '';
    return (row[idx] ?? '').trim();
  };

  const dateRaw = cell('date');
  const { date } = parseStatementDate(dateRaw);
  if (!date) return false;

  let signed: number | null = null;
  const amountRaw = cell('amount');
  if (map.amount != null) {
    signed = parseStatementAmount(amountRaw);
  } else {
    const debit = map.debit != null ? parseStatementAmount(cell('debit')) : null;
    const credit = map.credit != null ? parseStatementAmount(cell('credit')) : null;
    if (debit) signed = -Math.abs(debit);
    else if (credit) signed = Math.abs(credit);
  }
  if (signed == null || signed === 0) return false;
  if (Math.abs(signed) > 500_000_000) return false;

  const desc = cell('description');
  const cp = cell('counterparty');
  const narrative = [cp, desc].filter((x) => x && !isJunkCounterpartyValue(x)).join(' ');
  if (!narrative && isJunkCounterpartyValue(desc) && isJunkCounterpartyValue(cp)) return false;

  return true;
}
