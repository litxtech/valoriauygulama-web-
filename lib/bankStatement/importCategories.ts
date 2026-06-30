import type { ResolvedImportLine } from '@/lib/bankStatement/types';

export type ImportExcludeCategoryId =
  | 'atm'
  | 'transfer_out'
  | 'transfer_in'
  | 'transfer_all'
  | 'pos'
  | 'fee'
  | 'salary';

export type ImportExcludeCategory = {
  id: ImportExcludeCategoryId;
  label: string;
  shortLabel: string;
  hint: string;
  icon: 'card-outline' | 'swap-horizontal-outline' | 'arrow-down-outline' | 'arrow-up-outline' | 'git-compare-outline' | 'receipt-outline' | 'cash-outline' | 'wallet-outline';
};

/** Belge yüklemeden önce işaretlenebilir — işaretli olanlar içe aktarılmaz */
export const IMPORT_EXCLUDE_CATEGORIES: ImportExcludeCategory[] = [
  {
    id: 'atm',
    label: 'ATM / nakit çekim',
    shortLabel: 'ATM',
    hint: 'Bankamatik ve nakit çekim işlemleri',
    icon: 'card-outline',
  },
  {
    id: 'transfer_all',
    label: 'Tüm para transferleri',
    shortLabel: 'Transfer',
    hint: 'Gelen ve giden havale, EFT, FAST',
    icon: 'swap-horizontal-outline',
  },
  {
    id: 'transfer_out',
    label: 'Giden havale / EFT',
    shortLabel: 'Giden',
    hint: 'Gönderilen havale ve EFT işlemleri',
    icon: 'arrow-up-outline',
  },
  {
    id: 'transfer_in',
    label: 'Gelen havale / EFT',
    shortLabel: 'Gelen',
    hint: 'Alınan havale ve EFT işlemleri',
    icon: 'arrow-down-outline',
  },
  {
    id: 'pos',
    label: 'POS / kart',
    shortLabel: 'POS',
    hint: 'Kartlı ödeme ve POS işlemleri',
    icon: 'wallet-outline',
  },
  {
    id: 'fee',
    label: 'Komisyon / ücret',
    shortLabel: 'Ücret',
    hint: 'Banka masrafı, komisyon, BSMV',
    icon: 'receipt-outline',
  },
  {
    id: 'salary',
    label: 'Maaş / bordro',
    shortLabel: 'Maaş',
    hint: 'Maaş ve bordro ödemeleri',
    icon: 'cash-outline',
  },
];

// Sınıflandırma metni: Türkçe harfler JS \b sınırlarıyla uyumsuz olduğundan
// önce ascii'ye indirgenir; böylece "Ücreti", "MASRAFI" gibi ekli formlar da yakalanır.
const TR_DOWNCASE: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
};

export function normalizeCategoryText(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/i\u0307/g, 'i')
    .replace(/[çğıöşü]/g, (c) => TR_DOWNCASE[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim();
}

const ATM_RE =
  /\b(atm|bankamatik|nakit\s*cekim|cash\s*withdrawal|para\s*cekme|para\s*cekim|withdrawal)\b/;

const TRANSFER_RE = /\b(havale|eft|fast|transfer|wire|swift|remittance)\b/;

const POS_RE = /\b(pos|kart\s*har|kartli|card\s*payment|temassiz|visa|mastercard|troy)\b/;

// Banka kaynaklı transfer/işlem ücretleri ve masraflar — hiçbir dosyada cariye yazılmaz.
// "ucret" tek başına eşleşmez (kira/danışmanlık ücreti gibi gerçek ödemeleri korumak için);
// yalnızca banka/transfer bağlamındaki ücretler ve net masraf/komisyon kalemleri yakalanır.
const FEE_RE = new RegExp(
  [
    'komisyon',
    'bsmv',
    'kkdf',
    'damga\\s*vergi',
    'masraf',
    'hesap\\s*isletim',
    '(?:para\\s*)?transfer\\s*ucret',
    'havale\\s*ucret',
    'eft\\s*ucret',
    'fast\\s*ucret',
    'eft[\\s/-]*fast\\s*ucret',
    'islem\\s*ucret',
    'islem\\s*bedel',
    'fee(?:s)?(?![a-z])',
    'charge(?:s)?(?![a-z])',
  ].join('|')
);

const SALARY_RE = /\b(maas|salary|payroll|bordro|wage)\b/;

export type ImportLineCategory = ImportExcludeCategoryId | 'other';

export function lineCategorySearchText(
  line: Pick<ResolvedImportLine, 'description' | 'counterpartyNameRaw' | 'bankReference'>
): string {
  return [line.description, line.counterpartyNameRaw, line.bankReference].filter(Boolean).join(' ');
}

export function classifyImportLine(
  line: Pick<ResolvedImportLine, 'description' | 'direction' | 'counterpartyNameRaw' | 'bankReference'>
): ImportLineCategory {
  const text = normalizeCategoryText(lineCategorySearchText(line));

  if (ATM_RE.test(text)) return 'atm';
  if (FEE_RE.test(text)) return 'fee';
  if (POS_RE.test(text)) return 'pos';
  if (SALARY_RE.test(text)) return 'salary';
  if (TRANSFER_RE.test(text)) {
    return line.direction === 'credit' ? 'transfer_in' : 'transfer_out';
  }
  return 'other';
}

function isExcludedByCategories(
  category: ImportLineCategory,
  excluded: ReadonlySet<ImportExcludeCategoryId>
): boolean {
  if (category === 'other') return false;
  if (excluded.has(category)) return true;
  if (
    excluded.has('transfer_all') &&
    (category === 'transfer_in' || category === 'transfer_out')
  ) {
    return true;
  }
  return false;
}

export type ImportCategoryExclusionReport = {
  byCategory: Partial<Record<ImportExcludeCategoryId, { count: number; amount: number }>>;
  totalRemoved: number;
  totalRemovedAmount: number;
};

export function applyImportCategoryExclusions(
  lines: ResolvedImportLine[],
  excluded: ReadonlySet<ImportExcludeCategoryId>
): { lines: ResolvedImportLine[]; report: ImportCategoryExclusionReport } {
  if (!excluded.size) {
    return {
      lines,
      report: { byCategory: {}, totalRemoved: 0, totalRemovedAmount: 0 },
    };
  }

  const byCategory: ImportCategoryExclusionReport['byCategory'] = {};
  let totalRemoved = 0;
  let totalRemovedAmount = 0;
  const kept: ResolvedImportLine[] = [];

  for (const line of lines) {
    const category = classifyImportLine(line);
    if (!isExcludedByCategories(category, excluded)) {
      kept.push(line);
      continue;
    }

    totalRemoved += 1;
    totalRemovedAmount += line.amount;

    const bucketKey: ImportExcludeCategoryId =
      category === 'transfer_in' || category === 'transfer_out'
        ? excluded.has('transfer_all')
          ? 'transfer_all'
          : category
        : (category as ImportExcludeCategoryId);

    const bucket = byCategory[bucketKey] ?? { count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount += line.amount;
    byCategory[bucketKey] = bucket;
  }

  return {
    lines: kept,
    report: { byCategory, totalRemoved, totalRemovedAmount },
  };
}

export function categoryLabel(id: ImportExcludeCategoryId): string {
  return IMPORT_EXCLUDE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
