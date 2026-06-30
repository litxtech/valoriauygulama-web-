import type {
  CounterpartyCandidate,
  MatchConfidence,
  MatchMethod,
  ParsedBankLine,
  PersonImportGroup,
  ResolvedImportLine,
} from '@/lib/bankStatement/types';
import {
  buildGroupKey,
  extractNameFromNarrative,
  levenshteinSimilarity,
  normalizeCounterpartyName,
  normalizeIban,
} from '@/lib/bankStatement/normalize';
import { isJunkCounterpartyValue, isBankFeeOrJunkName } from '@/lib/bankStatement/tablePrep';
import { classifyImportLine } from '@/lib/bankStatement/importCategories';

export type BankAliasRow = {
  alias_type: 'iban' | 'tax_id' | 'name_normalized';
  alias_value: string;
  counterparty_id: string;
};

function ibanFromExtra(extra: string | null): string | null {
  if (!extra?.trim()) return null;
  return normalizeIban(extra.replace(/\s+/g, '')) ?? normalizeIban(extra.match(/TR\d{24}/i)?.[0] ?? '');
}

export function resolveImportCounterpartyName(
  line: Pick<ResolvedImportLine, 'counterpartyNameRaw' | 'displayName'>
): string | null {
  const raw = line.counterpartyNameRaw?.trim();
  if (raw) return raw;
  const display = line.displayName?.trim();
  if (display && display !== 'Kişi belirlenemedi') return display;
  return null;
}

export function resolveImportLines(params: {
  lines: ParsedBankLine[];
  counterparties: CounterpartyCandidate[];
  aliases: BankAliasRow[];
}): ResolvedImportLine[] {
  const activeCpIds = new Set(params.counterparties.map((c) => c.id));
  const aliasIban = new Map<string, string>();
  const aliasTax = new Map<string, string>();
  const aliasName = new Map<string, string>();

  for (const a of params.aliases) {
    if (!activeCpIds.has(a.counterparty_id)) continue;
    if (a.alias_type === 'iban') aliasIban.set(a.alias_value, a.counterparty_id);
    if (a.alias_type === 'tax_id') aliasTax.set(a.alias_value, a.counterparty_id);
    if (a.alias_type === 'name_normalized') aliasName.set(a.alias_value, a.counterparty_id);
  }

  const cpIndex = params.counterparties.map((c) => ({
    ...c,
    normName: normalizeCounterpartyName(c.name),
    iban: ibanFromExtra(c.extra_info),
    taxId: c.tax_id?.trim() || null,
  }));

  return params.lines.map((line) => {
    const extractedName = extractNameFromNarrative(
      line.description,
      line.counterpartyIban,
      line.counterpartyTaxId
    );
    const rawName =
      line.counterpartyNameRaw?.trim() && !isJunkCounterpartyValue(line.counterpartyNameRaw)
        ? line.counterpartyNameRaw.trim()
        : null;
    const resolvedName =
      rawName && !isBankFeeOrJunkName(rawName)
        ? rawName
        : extractedName && !isBankFeeOrJunkName(extractedName)
          ? extractedName
          : null;

    const displayName =
      resolvedName ||
      line.counterpartyIban ||
      line.counterpartyTaxId ||
      'Kişi belirlenemedi';
    const importName = resolvedName ?? (displayName !== 'Kişi belirlenemedi' ? displayName : null);
    const groupKey = buildGroupKey({
      iban: line.counterpartyIban,
      taxId: line.counterpartyTaxId,
      name: resolvedName,
    });
    const counterpartyNameNormalized = normalizeCounterpartyName(importName);

    const lineCategory = classifyImportLine({
      description: line.description,
      direction: line.direction,
      counterpartyNameRaw: resolvedName,
      bankReference: line.bankReference,
    });
    const isNonPersonLine = lineCategory === 'fee' || lineCategory === 'atm';

    let resolvedCounterpartyId: string | null = null;
    let matchConfidence: MatchConfidence = 'none';
    let matchMethod: MatchMethod | null = null;

    if (line.counterpartyIban) {
      const byAlias = aliasIban.get(line.counterpartyIban);
      if (byAlias) {
        resolvedCounterpartyId = byAlias;
        matchConfidence = 'high';
        matchMethod = 'alias';
      } else {
        const byCp = cpIndex.find((c) => c.iban === line.counterpartyIban);
        if (byCp) {
          resolvedCounterpartyId = byCp.id;
          matchConfidence = 'high';
          matchMethod = 'iban';
        }
      }
    }

    if (!resolvedCounterpartyId && line.counterpartyTaxId) {
      const byAlias = aliasTax.get(line.counterpartyTaxId);
      if (byAlias) {
        resolvedCounterpartyId = byAlias;
        matchConfidence = 'high';
        matchMethod = 'alias';
      } else {
        const byCp = cpIndex.find((c) => c.taxId === line.counterpartyTaxId);
        if (byCp) {
          resolvedCounterpartyId = byCp.id;
          matchConfidence = 'high';
          matchMethod = 'tax_id';
        }
      }
    }

    if (!resolvedCounterpartyId && counterpartyNameNormalized) {
      const byAlias = aliasName.get(counterpartyNameNormalized);
      if (byAlias) {
        resolvedCounterpartyId = byAlias;
        matchConfidence = 'high';
        matchMethod = 'alias';
      } else {
        const exact = cpIndex.find((c) => c.normName === counterpartyNameNormalized);
        if (exact) {
          resolvedCounterpartyId = exact.id;
          matchConfidence = 'high';
          matchMethod = 'name_exact';
        } else {
          let best: { id: string; score: number } | null = null;
          for (const c of cpIndex) {
            if (!c.normName) continue;
            const score = levenshteinSimilarity(c.normName, counterpartyNameNormalized);
            if (score >= 0.88 && (!best || score > best.score)) {
              best = { id: c.id, score };
            }
          }
          if (best) {
            resolvedCounterpartyId = best.id;
            matchConfidence = 'medium';
            matchMethod = 'name_fuzzy';
          }
        }
      }
    }

    const hasPersonHint =
      !isNonPersonLine &&
      (!!line.counterpartyIban || !!line.counterpartyTaxId || !!resolvedName);
    const createNewPerson =
      !resolvedCounterpartyId &&
      hasPersonHint &&
      displayName !== 'Kişi belirlenemedi';
    const skip = !hasPersonHint;
    const canImport = !!resolvedCounterpartyId || createNewPerson;
    const selected = canImport;

    if (createNewPerson) {
      matchMethod = 'new';
      matchConfidence = 'low';
    }

    return {
      ...line,
      counterpartyNameRaw: importName,
      groupKey,
      displayName,
      matchConfidence,
      matchMethod,
      resolvedCounterpartyId,
      createNewPerson,
      skip,
      selected,
      counterpartyNameNormalized: counterpartyNameNormalized || null,
    };
  });
}

export function groupImportLineTotals(lines: ResolvedImportLine[]) {
  let incomeTotal = 0;
  let expenseTotal = 0;
  let selectedIncome = 0;
  let selectedExpense = 0;
  for (const line of lines) {
    if (line.direction === 'credit') {
      incomeTotal += line.amount;
      if (line.selected) selectedIncome += line.amount;
    } else {
      expenseTotal += line.amount;
      if (line.selected) selectedExpense += line.amount;
    }
  }
  return {
    incomeTotal,
    expenseTotal,
    netBalance: incomeTotal - expenseTotal,
    selectedIncome,
    selectedExpense,
    selectedNet: selectedIncome - selectedExpense,
  };
}

export function groupImportLinesByPerson(lines: ResolvedImportLine[]): PersonImportGroup[] {
  const map = new Map<string, PersonImportGroup>();

  for (const line of lines) {
    let group = map.get(line.groupKey);
    if (!group) {
      group = {
        groupKey: line.groupKey,
        displayName: line.displayName,
        counterpartyIban: line.counterpartyIban,
        counterpartyTaxId: line.counterpartyTaxId,
        lines: [],
        incomeTotal: 0,
        expenseTotal: 0,
        resolvedCounterpartyId: line.resolvedCounterpartyId,
        createNewPerson: line.createNewPerson,
        matchConfidence: line.matchConfidence,
      };
      map.set(line.groupKey, group);
    }
    group.lines.push(line);
    if (line.direction === 'credit') group.incomeTotal += line.amount;
    else group.expenseTotal += line.amount;

    if (line.resolvedCounterpartyId && !group.resolvedCounterpartyId) {
      group.resolvedCounterpartyId = line.resolvedCounterpartyId;
      group.createNewPerson = false;
      group.matchConfidence = line.matchConfidence;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, 'tr'));
}

export function applyBulkCounterparty(
  lines: ResolvedImportLine[],
  counterpartyId: string | null,
  createNew: boolean,
  filter?: (line: ResolvedImportLine) => boolean
): ResolvedImportLine[] {
  return lines.map((line) => {
    if (filter && !filter(line)) return line;
    const canImport = !!counterpartyId || createNew;
    return {
      ...line,
      resolvedCounterpartyId: counterpartyId,
      createNewPerson: createNew && !counterpartyId,
      skip: !canImport,
      selected: canImport ? line.selected : false,
      matchMethod: counterpartyId ? 'manual' : createNew ? 'new' : line.matchMethod,
      matchConfidence: counterpartyId ? 'high' : line.matchConfidence,
    };
  });
}

export function applyGroupCounterparty(
  lines: ResolvedImportLine[],
  groupKey: string,
  counterpartyId: string | null,
  createNew: boolean
): ResolvedImportLine[] {
  return lines.map((line) => {
    if (line.groupKey !== groupKey) return line;
    const canImport = !!counterpartyId || createNew;
    return {
      ...line,
      resolvedCounterpartyId: counterpartyId,
      createNewPerson: createNew && !counterpartyId,
      skip: !canImport,
      selected: canImport ? line.selected : false,
      matchMethod: counterpartyId ? 'manual' : createNew ? 'new' : line.matchMethod,
      matchConfidence: counterpartyId ? 'high' : line.matchConfidence,
    };
  });
}

export function applyLineCounterparty(
  lines: ResolvedImportLine[],
  localId: string,
  counterpartyId: string | null,
  createNew: boolean
): ResolvedImportLine[] {
  return lines.map((line) => {
    if (line.localId !== localId) return line;
    const canImport = !!counterpartyId || createNew;
    return {
      ...line,
      resolvedCounterpartyId: counterpartyId,
      createNewPerson: createNew && !counterpartyId,
      skip: !canImport,
      selected: canImport,
      matchMethod: counterpartyId ? 'manual' : createNew ? 'new' : line.matchMethod,
      matchConfidence: counterpartyId ? 'high' : line.matchConfidence,
    };
  });
}

export function toggleImportLineSelected(
  lines: ResolvedImportLine[],
  localId: string,
  selected: boolean
): ResolvedImportLine[] {
  return lines.map((line) => (line.localId === localId ? { ...line, selected } : line));
}

export function toggleAllImportLinesSelected(
  lines: ResolvedImportLine[],
  selected: boolean
): ResolvedImportLine[] {
  return lines.map((line) => {
    const canImport = !!line.resolvedCounterpartyId || line.createNewPerson;
    if (!canImport) return { ...line, selected: false };
    return { ...line, selected };
  });
}

export function removeImportLines(lines: ResolvedImportLine[], localIds: string[]): ResolvedImportLine[] {
  const drop = new Set(localIds);
  return lines.filter((l) => !drop.has(l.localId));
}

export function removeGroupImportLines(lines: ResolvedImportLine[], groupKey: string): ResolvedImportLine[] {
  return lines.filter((l) => l.groupKey !== groupKey);
}

export function removeDeselectedImportLines(lines: ResolvedImportLine[]): ResolvedImportLine[] {
  return lines.filter((l) => l.selected);
}

export function toggleGroupImportLinesSelected(
  lines: ResolvedImportLine[],
  groupKey: string,
  selected: boolean
): ResolvedImportLine[] {
  return lines.map((line) => {
    if (line.groupKey !== groupKey) return line;
    const canImport = !!line.resolvedCounterpartyId || line.createNewPerson;
    if (!canImport) return { ...line, selected: false };
    return { ...line, selected };
  });
}

export function counterpartyLabel(id: string, counterparties: CounterpartyCandidate[]): string {
  return counterparties.find((c) => c.id === id)?.name ?? '—';
}
