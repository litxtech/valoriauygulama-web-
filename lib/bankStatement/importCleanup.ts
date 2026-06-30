import type { ResolvedImportLine } from '@/lib/bankStatement/types';
import { levenshteinSimilarity, normalizeCounterpartyName } from '@/lib/bankStatement/normalize';

const ATM_RE =
  /\b(atm|bankamatik|nakit\s*çekim|nakit\s*cekim|cash\s*withdrawal|para\s*çekme|para\s*cekm|withdrawal)\b/i;

export type ImportCleanupReport = {
  atmRemoved: number;
  duplicatesRemoved: number;
  atmRemovedAmount: number;
};

export function isAtmTransaction(line: Pick<ResolvedImportLine, 'description'>): boolean {
  return ATM_RE.test(line.description);
}

export function isLowAmountAtm(
  line: Pick<ResolvedImportLine, 'description' | 'amount'>,
  thresholdTry = 100
): boolean {
  return isAtmTransaction(line) && line.amount < thresholdTry;
}

/** Tarih + saat (saniye) + yön + tutar + belge — dedupKey ile aynı mantık */
export function fullDuplicateKey(line: ResolvedImportLine): string {
  return line.dedupKey;
}

/** @deprecated use fullDuplicateKey */
export function exactTransactionKey(line: ResolvedImportLine): string {
  return fullDuplicateKey(line);
}

export type DuplicateTransactionSuggestion = {
  id: string;
  displayName: string;
  valueDate: string;
  valueTime: string | null;
  amount: number;
  direction: 'credit' | 'debit';
  documentLabel: string;
  keepLocalId: string;
  removeLocalIds: string[];
  duplicateCount: number;
};

export function findDuplicateTransactionSuggestions(
  lines: ResolvedImportLine[]
): DuplicateTransactionSuggestion[] {
  const buckets = new Map<string, ResolvedImportLine[]>();

  for (const line of lines) {
    const key = fullDuplicateKey(line);
    const list = buckets.get(key) ?? [];
    list.push(line);
    buckets.set(key, list);
  }

  const suggestions: DuplicateTransactionSuggestion[] = [];

  for (const [key, group] of buckets.entries()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.localId.localeCompare(b.localId));
    const first = sorted[0];
    const removeLocalIds = sorted.slice(1).map((l) => l.localId);
    const docLabel =
      first.bankReference?.trim() ||
      (first.description.length > 48 ? `${first.description.slice(0, 48)}…` : first.description);

    suggestions.push({
      id: key,
      displayName: first.displayName,
      valueDate: first.valueDate,
      valueTime: first.valueTime,
      amount: first.amount,
      direction: first.direction,
      documentLabel: docLabel,
      keepLocalId: first.localId,
      removeLocalIds,
      duplicateCount: removeLocalIds.length,
    });
  }

  return suggestions.sort((a, b) => b.duplicateCount - a.duplicateCount);
}

export function removeDuplicateLinesByIds(
  lines: ResolvedImportLine[],
  localIds: string[]
): ResolvedImportLine[] {
  const drop = new Set(localIds);
  return lines.filter((l) => !drop.has(l.localId));
}

export function applyDuplicateSuggestion(
  lines: ResolvedImportLine[],
  suggestion: DuplicateTransactionSuggestion
): ResolvedImportLine[] {
  return removeDuplicateLinesByIds(lines, suggestion.removeLocalIds);
}

export function applyAllDuplicateSuggestions(
  lines: ResolvedImportLine[],
  suggestions: DuplicateTransactionSuggestion[]
): { lines: ResolvedImportLine[]; removed: number } {
  const toRemove = new Set<string>();
  for (const s of suggestions) {
    for (const id of s.removeLocalIds) toRemove.add(id);
  }
  return {
    lines: lines.filter((l) => !toRemove.has(l.localId)),
    removed: toRemove.size,
  };
}

export function removeExactDuplicateLines(lines: ResolvedImportLine[]): {
  lines: ResolvedImportLine[];
  removed: number;
} {
  const seen = new Set<string>();
  const kept: ResolvedImportLine[] = [];
  let removed = 0;

  for (const line of lines) {
    const key = fullDuplicateKey(line);
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    kept.push(line);
  }

  return { lines: kept, removed };
}

export function removeLowAmountAtmLines(
  lines: ResolvedImportLine[],
  thresholdTry = 100
): { lines: ResolvedImportLine[]; removed: number; removedAmount: number } {
  let removed = 0;
  let removedAmount = 0;
  const kept = lines.filter((line) => {
    if (!isLowAmountAtm(line, thresholdTry)) return true;
    removed += 1;
    removedAmount += line.amount;
    return false;
  });
  return { lines: kept, removed, removedAmount };
}

export function applyImportAutoCleanup(
  lines: ResolvedImportLine[],
  options?: { atmThresholdTry?: number; autoRemoveDuplicates?: boolean }
): { lines: ResolvedImportLine[]; report: ImportCleanupReport } {
  const threshold = options?.atmThresholdTry ?? 100;
  const autoDup = options?.autoRemoveDuplicates ?? false;

  let working = lines;
  let duplicatesRemoved = 0;
  if (autoDup) {
    const dup = removeExactDuplicateLines(working);
    working = dup.lines;
    duplicatesRemoved = dup.removed;
  }

  const atm = removeLowAmountAtmLines(working, threshold);

  return {
    lines: atm.lines,
    report: {
      duplicatesRemoved,
      atmRemoved: atm.removed,
      atmRemovedAmount: atm.removedAmount,
    },
  };
}

export type NameMergeSuggestion = {
  id: string;
  names: string[];
  groupKeys: string[];
  lineCount: number;
  canonicalName: string;
};

function namesSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  return levenshteinSimilarity(a, b) >= 0.88;
}

export function findNameMergeSuggestions(lines: ResolvedImportLine[]): NameMergeSuggestion[] {
  const groupMap = new Map<string, { displayName: string; norm: string; count: number }>();

  for (const line of lines) {
    const norm = normalizeCounterpartyName(line.displayName) || normalizeCounterpartyName(line.counterpartyNameRaw);
    if (!norm || norm.length < 3) continue;
    const cur = groupMap.get(line.groupKey);
    if (!cur) {
      groupMap.set(line.groupKey, { displayName: line.displayName, norm, count: 1 });
    } else {
      cur.count += 1;
      if (line.displayName.length > cur.displayName.length) cur.displayName = line.displayName;
    }
  }

  const entries = Array.from(groupMap.entries()).map(([groupKey, v]) => ({
    groupKey,
    ...v,
  }));

  const parent = entries.map((_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }
  function unite(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (namesSimilar(entries[i].norm, entries[j].norm)) unite(i, j);
    }
  }

  const clusters = new Map<number, typeof entries>();
  for (let i = 0; i < entries.length; i++) {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push(entries[i]);
    clusters.set(root, list);
  }

  const suggestions: NameMergeSuggestion[] = [];
  for (const cluster of clusters.values()) {
    if (cluster.length < 2) continue;
    const names = [...new Set(cluster.map((c) => c.displayName))];
    const groupKeys = cluster.map((c) => c.groupKey);
    const lineCount = cluster.reduce((s, c) => s + c.count, 0);
    const canonicalName = cluster.reduce((best, c) => (c.displayName.length > best.length ? c.displayName : best), '');
    suggestions.push({
      id: groupKeys.sort().join('::'),
      names,
      groupKeys,
      lineCount,
      canonicalName,
    });
  }

  return suggestions.sort((a, b) => b.lineCount - a.lineCount);
}

export function mergeImportNameGroups(
  lines: ResolvedImportLine[],
  groupKeys: string[],
  canonicalName: string
): ResolvedImportLine[] {
  const keySet = new Set(groupKeys);
  const norm = normalizeCounterpartyName(canonicalName);
  const unifiedKey = norm ? `name:${norm}` : groupKeys[0];

  return lines.map((line) => {
    if (!keySet.has(line.groupKey)) return line;
    return {
      ...line,
      groupKey: unifiedKey,
      displayName: canonicalName,
      counterpartyNameNormalized: norm || line.counterpartyNameNormalized,
    };
  });
}
