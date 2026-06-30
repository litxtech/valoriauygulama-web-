import type { FinanceLedgerScope } from '@/lib/financeLedger';

export type BankStatementFormat =
  | 'mt940'
  | 'csv'
  | 'xlsx'
  | 'txt'
  | 'xml'
  | 'pdf'
  | 'unknown';

export type BankCode =
  | 'ziraat'
  | 'halkbank'
  | 'vakifbank'
  | 'akbank'
  | 'isbank'
  | 'yapikredi'
  | 'garanti'
  | 'qnb'
  | 'denizbank'
  | 'kuveytturk'
  | 'teb'
  | 'ing'
  | 'albaraka'
  | 'turkiyefinans'
  | 'enpara'
  | 'papara'
  | 'wise'
  | 'revolut'
  | 'payoneer'
  | 'mercury'
  | 'stripe'
  | 'other';

export const BANK_OPTIONS: { code: BankCode; label: string }[] = [
  { code: 'akbank', label: 'Akbank' },
  { code: 'ziraat', label: 'Ziraat Bankası' },
  { code: 'isbank', label: 'İş Bankası' },
  { code: 'garanti', label: 'Garanti BBVA' },
  { code: 'yapikredi', label: 'Yapı Kredi' },
  { code: 'vakifbank', label: 'VakıfBank' },
  { code: 'halkbank', label: 'Halkbank' },
  { code: 'qnb', label: 'QNB' },
  { code: 'denizbank', label: 'DenizBank' },
  { code: 'ing', label: 'ING' },
  { code: 'teb', label: 'TEB' },
  { code: 'kuveytturk', label: 'Kuveyt Türk' },
  { code: 'albaraka', label: 'Albaraka' },
  { code: 'turkiyefinans', label: 'Türkiye Finans' },
  { code: 'enpara', label: 'Enpara' },
  { code: 'papara', label: 'Papara' },
  { code: 'wise', label: 'Wise' },
  { code: 'revolut', label: 'Revolut' },
  { code: 'payoneer', label: 'Payoneer' },
  { code: 'mercury', label: 'Mercury' },
  { code: 'stripe', label: 'Stripe Payout' },
  { code: 'other', label: 'Diğer / Otomatik' },
];

/** @deprecated use BANK_OPTIONS */
export const TURKISH_BANK_OPTIONS = BANK_OPTIONS.filter((b) =>
  ['ziraat', 'halkbank', 'vakifbank', 'akbank', 'isbank', 'yapikredi', 'garanti', 'qnb', 'denizbank', 'kuveytturk', 'teb', 'ing', 'other'].includes(
    b.code
  )
);

export type StatementDirection = 'credit' | 'debit';

export type ParsedBankLine = {
  localId: string;
  valueDate: string;
  valueTime: string | null;
  direction: StatementDirection;
  amount: number;
  currency: string;
  description: string;
  counterpartyNameRaw: string | null;
  counterpartyIban: string | null;
  counterpartyTaxId: string | null;
  bankReference: string | null;
  rawLine61: string | null;
  rawLine86: string | null;
  dedupKey: string;
};

export type ParsedBankStatement = {
  format: BankStatementFormat;
  accountIban: string | null;
  lines: ParsedBankLine[];
};

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';

export type MatchMethod = 'iban' | 'tax_id' | 'alias' | 'name_exact' | 'name_fuzzy' | 'manual' | 'new';

export type CounterpartyCandidate = {
  id: string;
  name: string;
  party_type: string;
  tax_id: string | null;
  extra_info: string | null;
};

export type ResolvedImportLine = ParsedBankLine & {
  groupKey: string;
  displayName: string;
  matchConfidence: MatchConfidence;
  matchMethod: MatchMethod | null;
  resolvedCounterpartyId: string | null;
  createNewPerson: boolean;
  skip: boolean;
  selected: boolean;
  counterpartyNameNormalized: string | null;
};

export type PersonImportGroup = {
  groupKey: string;
  displayName: string;
  counterpartyIban: string | null;
  counterpartyTaxId: string | null;
  lines: ResolvedImportLine[];
  incomeTotal: number;
  expenseTotal: number;
  resolvedCounterpartyId: string | null;
  createNewPerson: boolean;
  matchConfidence: MatchConfidence;
};

export type BankImportCommitParams = {
  organizationId: string;
  staffId: string;
  fileName: string;
  fileFormat: BankStatementFormat;
  bankCode: BankCode;
  ledgerScope: FinanceLedgerScope;
  lines: ResolvedImportLine[];
};
