import { fmtMoneyTry } from '@/lib/financeLedger';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';
import type { Ionicons } from '@expo/vector-icons';

export type CounterpartyTypeMeta = {
  label: string;
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
  hint: string;
};

export const COUNTERPARTY_TYPE_META: Record<FinanceCounterpartyType, CounterpartyTypeMeta> = {
  customer: {
    label: 'Müşteri',
    shortLabel: 'Müşteri',
    icon: 'person-outline',
    color: '#0369a1',
    bg: '#e0f2fe',
    hint: 'Size para ödeyen',
  },
  supplier: {
    label: 'Tedarikçi',
    shortLabel: 'Tedarikçi',
    icon: 'storefront-outline',
    color: '#b45309',
    bg: '#ffedd5',
    hint: 'Sizin mal/hizmet aldığınız',
  },
  subcontractor: {
    label: 'Taşeron',
    shortLabel: 'Taşeron',
    icon: 'hammer-outline',
    color: '#7c3aed',
    bg: '#ede9fe',
    hint: 'İş yapan usta veya ekip',
  },
  staff: {
    label: 'Personel',
    shortLabel: 'Personel',
    icon: 'id-card-outline',
    color: '#0d9488',
    bg: '#ccfbf1',
    hint: 'Çalışan / avans',
  },
  private_person: {
    label: 'Şahsi kişi',
    shortLabel: 'Şahsi',
    icon: 'person-circle-outline',
    color: '#be185d',
    bg: '#fce7f3',
    hint: 'Bireysel alacak / ödeme',
  },
  other: {
    label: 'Diğer',
    shortLabel: 'Diğer',
    icon: 'ellipse-outline',
    color: '#64748b',
    bg: '#f1f5f9',
    hint: 'Diğer kişi veya firma',
  },
  landlord: {
    label: 'Mal sahibi / kira',
    shortLabel: 'Kira',
    icon: 'home-outline',
    color: '#c2410c',
    bg: '#ffedd5',
    hint: 'Kira, aidat, mülk sahibi',
  },
  utility: {
    label: 'Fatura kurumu',
    shortLabel: 'Fatura',
    icon: 'flash-outline',
    color: '#ca8a04',
    bg: '#fef9c3',
    hint: 'Elektrik, su, doğalgaz, internet',
  },
  agency: {
    label: 'Acente',
    shortLabel: 'Acente',
    icon: 'airplane-outline',
    color: '#0284c7',
    bg: '#e0f2fe',
    hint: 'Tur, transfer, komisyon acentesi',
  },
  consultant: {
    label: 'Danışman',
    shortLabel: 'Danışman',
    icon: 'bulb-outline',
    color: '#7c3aed',
    bg: '#ede9fe',
    hint: 'Dış danışmanlık hizmeti',
  },
  government: {
    label: 'Resmi kurum',
    shortLabel: 'Kamu',
    icon: 'ribbon-outline',
    color: '#1d4ed8',
    bg: '#dbeafe',
    hint: 'Belediye, vergi, resmi ödemeler',
  },
  bank: {
    label: 'Banka',
    shortLabel: 'Banka',
    icon: 'card-outline',
    color: '#0f766e',
    bg: '#ccfbf1',
    hint: 'Banka, POS, kredi kuruluşu',
  },
  insurance: {
    label: 'Sigorta',
    shortLabel: 'Sigorta',
    icon: 'shield-checkmark-outline',
    color: '#059669',
    bg: '#d1fae5',
    hint: 'Sigorta poliçesi ve primleri',
  },
  lawyer: {
    label: 'Avukat / hukuk',
    shortLabel: 'Hukuk',
    icon: 'scale-outline',
    color: '#4338ca',
    bg: '#e0e7ff',
    hint: 'Hukuki danışmanlık ve dava',
  },
  accountant: {
    label: 'Muhasebeci',
    shortLabel: 'Muhasebe',
    icon: 'calculator-outline',
    color: '#0e7490',
    bg: '#cffafe',
    hint: 'Mali müşavir, muhasebe ofisi',
  },
  freelancer: {
    label: 'Serbest çalışan',
    shortLabel: 'Freelance',
    icon: 'laptop-outline',
    color: '#db2777',
    bg: '#fce7f3',
    hint: 'Proje bazlı dış kaynak',
  },
};

/** Özel tür adı varsa onu, yoksa sabit meta etiketini döner */
export function resolveCounterpartyTypeLabel(
  partyType: FinanceCounterpartyType,
  partyTypeLabel?: string | null
): string {
  const custom = partyTypeLabel?.trim();
  if (custom) return custom;
  return COUNTERPARTY_TYPE_META[partyType]?.label ?? partyType;
}

export function resolveCounterpartyTypeMeta(
  partyType: FinanceCounterpartyType,
  partyTypeLabel?: string | null
): CounterpartyTypeMeta {
  const base = COUNTERPARTY_TYPE_META[partyType] ?? COUNTERPARTY_TYPE_META.other;
  const custom = partyTypeLabel?.trim();
  if (!custom) return base;
  return {
    ...base,
    label: custom,
    shortLabel: custom,
    hint: 'Özel kategori',
  };
}

export function counterpartyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export type BalanceTone = 'positive' | 'negative' | 'zero';

export function formatCounterpartyBalance(net: number): { text: string; tone: BalanceTone; hint: string } {
  if (Math.abs(net) < 0.01) {
    return {
      text: 'Gelir ve gider eşit',
      tone: 'zero',
      hint: 'Bu cari ile kayıtlı alış ve satış tutarı birbirini götürüyor.',
    };
  }
  if (net > 0) {
    return {
      text: `Net: size ${fmtMoneyTry(net)} geldi`,
      tone: 'positive',
      hint: 'Bu kişiden/firmadan aldığınız para, ödediğinizden fazla.',
    };
  }
  return {
    text: `Net: ${fmtMoneyTry(Math.abs(net))} gitti`,
    tone: 'negative',
    hint: 'Bu kişiye/firmaya ödediğiniz para, aldığınızdan fazla.',
  };
}

/** Liste kartında kısa satır: gelir / gider */
export function formatCounterpartyFlow(income: number, expense: number): string {
  if (income < 0.01 && expense < 0.01) return 'Henüz işlem yok';
  const parts: string[] = [];
  if (income >= 0.01) parts.push(`↑ ${fmtMoneyTry(income)}`);
  if (expense >= 0.01) parts.push(`↓ ${fmtMoneyTry(expense)}`);
  return parts.join('  ·  ');
}
