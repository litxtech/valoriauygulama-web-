import { supabase } from '@/lib/supabase';
import type { FinanceLedgerScope } from '@/lib/financeLedger';
import type {
  BankCode,
  BankImportCommitParams,
  BankStatementFormat,
  CounterpartyCandidate,
  ResolvedImportLine,
} from '@/lib/bankStatement/types';
import {
  resolveImportCounterpartyName,
  type BankAliasRow,
} from '@/lib/bankStatement/matchCounterparty';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';
import {
  buildLegacyDedupKey,
  documentFingerprint,
  syncImportLineDedupKeys,
} from '@/lib/bankStatement/normalize';
import { removeExactDuplicateLines } from '@/lib/bankStatement/importCleanup';
export { parseBankStatementFromUri, type ParseStatementResult } from '@/lib/bankStatement/parseStatement';

export async function fetchCounterpartiesForImport(
  organizationId: string
): Promise<CounterpartyCandidate[]> {
  const { data, error } = await supabase
    .from('finance_counterparties')
    .select('id, name, party_type, tax_id, extra_info')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as CounterpartyCandidate[];
}

export async function fetchBankAliasesForImport(organizationId: string): Promise<BankAliasRow[]> {
  const { data, error } = await supabase
    .from('finance_counterparty_bank_aliases')
    .select('alias_type, alias_value, counterparty_id, finance_counterparties!inner(is_active)')
    .eq('organization_id', organizationId)
    .eq('finance_counterparties.is_active', true);
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<BankAliasRow & { finance_counterparties?: { is_active: boolean } }>).map(
    ({ finance_counterparties: _cp, ...alias }) => alias
  );
}

export type ImportCommitResult = {
  batchId: string;
  movementCount: number;
  skippedCount: number;
  newCounterpartyCount: number;
  duplicateCount: number;
};

export async function commitBankStatementImport(
  params: BankImportCommitParams
): Promise<ImportCommitResult> {
  const importLines = params.lines.filter((l) => l.selected);
  const payload = importLines.map((line) => lineToRpcPayload(line));

  const { data, error } = await supabase.rpc('finance_import_bank_statement', {
    p_organization_id: params.organizationId,
    p_staff_id: params.staffId,
    p_file_name: params.fileName,
    p_file_format: params.fileFormat,
    p_bank_code: params.bankCode,
    p_ledger_scope: params.ledgerScope,
    p_lines: payload,
  });

  if (error) throw new Error(error.message);

  const result = data as {
    batch_id: string;
    movement_count: number;
    skipped_count: number;
    new_counterparty_count: number;
    duplicate_count: number;
  };

  invalidateCounterpartyBalanceCache(params.organizationId);

  return {
    batchId: result.batch_id,
    movementCount: result.movement_count ?? 0,
    skippedCount: result.skipped_count ?? 0,
    newCounterpartyCount: result.new_counterparty_count ?? 0,
    duplicateCount: result.duplicate_count ?? 0,
  };
}

function lineToRpcPayload(line: ResolvedImportLine): Record<string, unknown> {
  const base: Record<string, unknown> = {
    dedup_key: line.dedupKey,
    value_date: line.valueDate,
    direction: line.direction,
    amount: line.amount,
    currency: line.currency,
    description: line.description,
    counterparty_name_raw: line.counterpartyNameRaw,
    counterparty_iban: line.counterpartyIban,
    counterparty_tax_id: line.counterpartyTaxId,
    bank_reference: line.bankReference,
    match_method: line.matchMethod,
    counterparty_name_normalized: line.counterpartyNameNormalized,
    skip: true,
  };

  if (!line.selected) return base;

  if (line.resolvedCounterpartyId) {
    base.skip = false;
    base.resolved_counterparty_id = line.resolvedCounterpartyId;
    return base;
  }

  if (line.createNewPerson) {
    const newName = resolveImportCounterpartyName(line);
    if (newName) {
      base.skip = false;
      base.counterparty_name_raw = newName;
      base.create_counterparty = {
        name: newName,
        party_type: 'private_person',
        tax_id: line.counterpartyTaxId,
        iban: line.counterpartyIban,
      };
      return base;
    }
  }

  return base;
}

export type ImportBatchSummary = {
  id: string;
  file_name: string;
  file_format: BankStatementFormat;
  bank_code: BankCode;
  ledger_scope: FinanceLedgerScope;
  committed_at: string;
  movement_count: number;
  line_count: number;
  new_counterparty_count: number;
};

export type ExistingImportSignature = {
  dedup_key: string;
  value_date: string;
  direction: string;
  amount: number;
  bank_reference: string | null;
};

export async function fetchExistingImportSignatures(
  organizationId: string,
  options?: { excludeBatchId?: string }
): Promise<ExistingImportSignature[]> {
  const { data, error } = await supabase
    .from('finance_bank_statement_lines')
    .select('dedup_key, value_date, direction, amount, bank_reference, batch_id')
    .eq('organization_id', organizationId);
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  const rows = (data ?? []) as (ExistingImportSignature & { batch_id: string })[];
  const excludeBatchId = options?.excludeBatchId;
  if (!excludeBatchId) return rows;
  return rows
    .filter((row) => row.batch_id !== excludeBatchId)
    .map(({ batch_id: _batchId, ...rest }) => rest);
}

function lineMatchesExistingImport(
  line: ResolvedImportLine,
  existing: ExistingImportSignature,
  accountIban: string | null,
  bankCode: BankCode
): boolean {
  if (existing.dedup_key === line.dedupKey) return true;
  const legacyKey = buildLegacyDedupKey({
    bankCode,
    accountIban,
    valueDate: line.valueDate,
    direction: line.direction,
    amount: line.amount,
    bankReference: line.bankReference,
    description: line.description,
  });
  if (existing.dedup_key === legacyKey) return true;

  const ref = documentFingerprint(line.bankReference, line.description);
  const existRef = (existing.bank_reference ?? '').trim().toUpperCase();
  if (!existRef || !ref || existRef !== ref) return false;
  return (
    existing.value_date === line.valueDate &&
    existing.direction === line.direction &&
    Math.abs(Number(existing.amount) - line.amount) < 0.01
  );
}

export function filterAlreadyImportedLines(
  lines: ResolvedImportLine[],
  existing: ExistingImportSignature[],
  accountIban: string | null,
  bankCode: BankCode
): { lines: ResolvedImportLine[]; skippedExisting: number } {
  if (!existing.length) return { lines, skippedExisting: 0 };
  let skippedExisting = 0;
  const kept = lines.filter((line) => {
    const hit = existing.some((row) => lineMatchesExistingImport(line, row, accountIban, bankCode));
    if (hit) skippedExisting += 1;
    return !hit;
  });
  return { lines: kept, skippedExisting };
}

export function prepareImportLinesForPreview(params: {
  lines: ResolvedImportLine[];
  accountIban: string | null;
  bankCode: BankCode;
  existing: ExistingImportSignature[];
}): {
  lines: ResolvedImportLine[];
  duplicatesRemoved: number;
  skippedExisting: number;
} {
  const synced = syncImportLineDedupKeys(params.lines, params.accountIban);
  const { lines: deduped, removed: duplicatesRemoved } = removeExactDuplicateLines(synced);
  const { lines, skippedExisting } = filterAlreadyImportedLines(
    deduped,
    params.existing,
    params.accountIban,
    params.bankCode
  );
  return { lines, duplicatesRemoved, skippedExisting };
}

export async function fetchRecentImportBatches(
  organizationId: string,
  limit = 10
): Promise<ImportBatchSummary[]> {
  const { data, error } = await supabase
    .from('finance_bank_import_batches')
    .select(
      'id, file_name, file_format, bank_code, ledger_scope, committed_at, movement_count, line_count, new_counterparty_count'
    )
    .eq('organization_id', organizationId)
    .order('committed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ImportBatchSummary[];
}

export type DeleteImportBatchResult = {
  movementCount: number;
};

/** Önceki içe aktarım kaydını ve bu partiden oluşan ödeme hareketlerini siler. */
export async function deleteBankImportBatch(
  organizationId: string,
  batchId: string
): Promise<DeleteImportBatchResult> {
  const { data, error } = await supabase.rpc('finance_delete_bank_import_batch', {
    p_organization_id: organizationId,
    p_batch_id: batchId,
  });
  if (error) throw new Error(error.message);
  const result = data as { movement_count?: number };
  invalidateCounterpartyBalanceCache(organizationId);
  return { movementCount: result.movement_count ?? 0 };
}
