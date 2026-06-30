import type { BankCode } from '@/lib/bankStatement/types';
import type { ColumnField, TabularColumnMap } from '@/lib/bankStatement/columnMap';
import { autoDetectColumnMap } from '@/lib/bankStatement/columnMap';
import {
  extractAccountMeta,
  findTransactionHeaderIndex,
  isMetadataRow,
  rowHasValidTransaction,
  scoreRowAsTransactionHeader,
} from '@/lib/bankStatement/tablePrep';
import { normHeader } from '@/lib/bankStatement/columnMap';

type BankHeaderHint = {
  bank: BankCode;
  signature: RegExp;
  boosts: Partial<Record<ColumnField, string[]>>;
};

const HINTS: BankHeaderHint[] = [
  {
    bank: 'ziraat',
    signature: /tarih.*(açıklama|aciklama).*(borç|borc|alacak)/i,
    boosts: { description: ['açıklama', 'aciklama'], debit: ['borç', 'borc'], credit: ['alacak'] },
  },
  {
    bank: 'isbank',
    signature: /(işlem|islem)\s*tarihi/i,
    boosts: { date: ['işlem tarihi', 'islem tarihi'], description: ['açıklama', 'aciklama'] },
  },
  {
    bank: 'garanti',
    signature: /(tarih|date).*(açıklama|description|aciklama)/i,
    boosts: { description: ['açıklama', 'description', 'işlem açıklaması'] },
  },
  {
    bank: 'akbank',
    signature: /(işlem|islem)\s*tarihi/i,
    boosts: { date: ['işlem tarihi'], description: ['açıklama', 'detay'] },
  },
  {
    bank: 'halkbank',
    signature: /tarih.*açıklama|tarih.*aciklama/i,
    boosts: {},
  },
  {
    bank: 'enpara',
    signature: /tarih.*açıklama|tarih.*aciklama/i,
    boosts: { amount: ['tutar', 'işlem tutarı'] },
  },
  {
    bank: 'wise',
    signature: /(date|tarih).*(description|açıklama|payee)/i,
    boosts: { counterparty: ['payee', 'recipient', 'alıcı', 'alici'] },
  },
  {
    bank: 'stripe',
    signature: /(created|payout|gross|net|amount)/i,
    boosts: { description: ['description', 'type'], amount: ['net', 'amount'] },
  },
];

function boostDetectColumnMap(headers: string[], boosts: Partial<Record<ColumnField, string[]>>): TabularColumnMap {
  const map = { ...autoDetectColumnMap(headers) };

  for (const [field, candidates] of Object.entries(boosts) as [ColumnField, string[]][]) {
    for (let i = 0; i < headers.length; i++) {
      const h = normHeader(headers[i]);
      if (!candidates.some((c) => h === c || h.includes(c))) continue;
      for (const [f, idx] of Object.entries(map)) {
        if (idx === i) delete map[f as ColumnField];
      }
      map[field] = i;
      break;
    }
  }

  return map;
}

function scoreMap(dataRows: string[][], map: TabularColumnMap): number {
  let valid = 0;
  for (const row of dataRows.slice(0, 40)) {
    if (rowHasValidTransaction(row, map)) valid += 1;
  }
  return valid;
}

export function resolveColumnMap(
  headers: string[],
  bankCode: BankCode,
  dataRows: string[][],
  userMap?: TabularColumnMap
): TabularColumnMap {
  if (userMap) return userMap;

  const joined = headers.map(normHeader).join('|');
  let bestMap = autoDetectColumnMap(headers);
  let bestScore = scoreMap(dataRows, bestMap);

  const tryHints = bankCode === 'other' ? HINTS : HINTS.filter((h) => h.bank === bankCode);
  for (const hint of tryHints) {
    if (!hint.signature.test(joined)) continue;
    const candidate = boostDetectColumnMap(headers, hint.boosts);
    const score = scoreMap(dataRows, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestMap = candidate;
    }
  }

  return bestMap;
}

export function pickBestHeaderAndMap(
  rawRows: string[][],
  bankCode: BankCode,
  userMap?: TabularColumnMap
): {
  headers: string[];
  dataRows: string[][];
  columnMap: TabularColumnMap;
  accountIban: string | null;
} {
  const nonEmpty = rawRows.filter((r) => r.some((c) => c.trim()));
  const meta = extractAccountMeta(nonEmpty);

  if (!nonEmpty.length) {
    return { headers: [], dataRows: [], columnMap: {}, accountIban: null };
  }

  if (userMap) {
    const headerIndex = findTransactionHeaderIndex(nonEmpty);
    const headers = nonEmpty[headerIndex] ?? [];
    const dataRows = nonEmpty.slice(headerIndex + 1).filter((r) => !isMetadataRow(r));
    return { headers, dataRows, columnMap: userMap, accountIban: meta.accountIban };
  }

  let best = {
    headerIndex: findTransactionHeaderIndex(nonEmpty),
    score: -1,
    map: {} as TabularColumnMap,
  };

  const limit = Math.min(nonEmpty.length, 50);
  for (let i = 0; i < limit; i++) {
    const headers = nonEmpty[i];
    if (!headers?.length) continue;
    const dataRows = nonEmpty.slice(i + 1).filter((r) => !isMetadataRow(r));
    const map = resolveColumnMap(headers, bankCode, dataRows);
    const score = scoreMap(dataRows, map);
    if (score > best.score) {
      best = { headerIndex: i, score, map };
    }
  }

  const headers = nonEmpty[best.headerIndex] ?? [];
  const dataRows = nonEmpty.slice(best.headerIndex + 1).filter((r) => !isMetadataRow(r));

  return {
    headers,
    dataRows,
    columnMap: best.map,
    accountIban: meta.accountIban,
  };
}
