import type { BankCode, BankStatementFormat, ResolvedImportLine } from '@/lib/bankStatement/types';
import { BANK_OPTIONS } from '@/lib/bankStatement/types';

export type ImportSmartAnalysis = {
  detectedBank: BankCode;
  detectedBankLabel: string;
  detectedFormat: BankStatementFormat;
  totalIncome: number;
  totalExpense: number;
  monthly: { month: string; income: number; expense: number }[];
  topPayees: { name: string; total: number; count: number; kind: 'expense' | 'income' }[];
  categories: { label: string; amount: number; kind: 'expense' | 'income' }[];
  personTotals: {
    name: string;
    sent: number;
    received: number;
    net: number;
    count: number;
    createNew: boolean;
    matched: boolean;
  }[];
};

const CATEGORY_RULES: { label: string; re: RegExp; kind: 'expense' | 'income' }[] = [
  { label: 'Maaş / ücret', re: /maaş|maas|salary|payroll|ücret|ucret|wage/i, kind: 'income' },
  { label: 'Kira', re: /kira|rent|lease/i, kind: 'expense' },
  { label: 'Fatura / utility', re: /fatura|elektrik|su|doğalgaz|dogalgaz|internet|utility|bill/i, kind: 'expense' },
  { label: 'Havale / EFT', re: /havale|eft|fast|transfer|wire|swift/i, kind: 'expense' },
  { label: 'POS / kart', re: /pos|kart|card|visa|mastercard/i, kind: 'expense' },
  { label: 'Stripe / ödeme', re: /stripe|payout|paypal|iyzico/i, kind: 'income' },
  { label: 'Vergi / resmi', re: /vergi|tax|sgk|resmi|kurum/i, kind: 'expense' },
  { label: 'Market / gıda', re: /market|migros|a101|bim|şok|sok|gıda|gida|restoran/i, kind: 'expense' },
];

function categorize(description: string): { label: string; kind: 'expense' | 'income' } {
  for (const r of CATEGORY_RULES) {
    if (r.re.test(description)) return { label: r.label, kind: r.kind };
  }
  return { label: 'Diğer', kind: 'expense' };
}

export function buildImportSmartAnalysis(params: {
  lines: ResolvedImportLine[];
  detectedBank: BankCode;
  detectedFormat: BankStatementFormat;
}): ImportSmartAnalysis {
  const active = params.lines.filter((l) => l.selected);
  const monthlyMap = new Map<string, { income: number; expense: number }>();
  const payeeMap = new Map<string, { total: number; count: number; kind: 'expense' | 'income' }>();
  const personMap = new Map<
    string,
    { sent: number; received: number; count: number; createNew: boolean; matched: boolean }
  >();
  const catMap = new Map<string, { amount: number; kind: 'expense' | 'income' }>();

  let totalIncome = 0;
  let totalExpense = 0;

  for (const line of active) {
    const month = line.valueDate.slice(0, 7);
    const m = monthlyMap.get(month) ?? { income: 0, expense: 0 };
    if (line.direction === 'credit') {
      m.income += line.amount;
      totalIncome += line.amount;
    } else {
      m.expense += line.amount;
      totalExpense += line.amount;
    }
    monthlyMap.set(month, m);

    const name = line.displayName;
    const pk = payeeMap.get(name) ?? { total: 0, count: 0, kind: line.direction === 'credit' ? 'income' : 'expense' };
    pk.total += line.amount;
    pk.count += 1;
    payeeMap.set(name, pk);

    const person = personMap.get(name) ?? {
      sent: 0,
      received: 0,
      count: 0,
      createNew: false,
      matched: false,
    };
    if (line.direction === 'credit') person.received += line.amount;
    else person.sent += line.amount;
    person.count += 1;
    if (line.createNewPerson && !line.resolvedCounterpartyId) person.createNew = true;
    if (line.resolvedCounterpartyId) person.matched = true;
    personMap.set(name, person);

    const cat = categorize(line.description);
    const ck = `${cat.kind}:${cat.label}`;
    const c = catMap.get(ck) ?? { amount: 0, kind: cat.kind };
    c.amount += line.amount;
    catMap.set(ck, c);
  }

  const monthly = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, income: v.income, expense: v.expense }));

  const topPayees = Array.from(payeeMap.entries())
    .map(([name, v]) => ({ name, total: v.total, count: v.count, kind: v.kind }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const personTotals = Array.from(personMap.entries())
    .map(([name, v]) => ({
      name,
      sent: v.sent,
      received: v.received,
      net: v.received - v.sent,
      count: v.count,
      createNew: v.createNew,
      matched: v.matched,
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.sent + b.received - (a.sent + a.received));

  const categories = Array.from(catMap.entries())
    .map(([k, v]) => ({ label: k.split(':')[1], amount: v.amount, kind: v.kind }))
    .sort((a, b) => b.amount - a.amount);

  const bankLabel = BANK_OPTIONS.find((b) => b.code === params.detectedBank)?.label ?? 'Diğer';

  return {
    detectedBank: params.detectedBank,
    detectedBankLabel: bankLabel,
    detectedFormat: params.detectedFormat,
    totalIncome,
    totalExpense,
    monthly,
    topPayees,
    categories,
    personTotals,
  };
}
