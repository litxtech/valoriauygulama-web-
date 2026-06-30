import type { Ionicons } from '@expo/vector-icons';
import type { FinanceCheckDirection, FinanceCheckStatus } from '@/lib/finance';

/** Hızlı işaretleme: çek girildi / ödendi / ödenmedi */
export const CHECK_QUICK_ACTIONS: {
  status: FinanceCheckStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}[] = [
  {
    status: 'registered',
    label: 'Çek girildi',
    icon: 'create-outline',
    color: '#b45309',
    bg: '#fef3c7',
  },
  {
    status: 'paid',
    label: 'Ödendi',
    icon: 'checkmark-circle-outline',
    color: '#047857',
    bg: '#d1fae5',
  },
  {
    status: 'bounced',
    label: 'Ödenmedi',
    icon: 'close-circle-outline',
    color: '#b91c1c',
    bg: '#fee2e2',
  },
];

export const CHECK_DIR_META: Record<
  FinanceCheckDirection,
  { label: string; icon: 'arrow-up-circle' | 'arrow-down-circle'; color: string; bg: string; border: string; gradient: [string, string] }
> = {
  given: {
    label: 'Verilen çek',
    icon: 'arrow-up-circle',
    color: '#b91c1c',
    bg: '#fef2f2',
    border: '#fecaca',
    gradient: ['#dc2626', '#991b1b'],
  },
  received: {
    label: 'Alınan çek',
    icon: 'arrow-down-circle',
    color: '#047857',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    gradient: ['#059669', '#047857'],
  },
};

export function checkStatusTone(status: FinanceCheckStatus): { color: string; bg: string } {
  switch (status) {
    case 'paid':
      return { color: '#047857', bg: '#d1fae5' };
    case 'partial':
      return { color: '#0369a1', bg: '#e0f2fe' };
    case 'presented':
      return { color: '#7c3aed', bg: '#ede9fe' };
    case 'bounced':
      return { color: '#b91c1c', bg: '#fee2e2' };
    case 'cancelled':
      return { color: '#64748b', bg: '#f1f5f9' };
    case 'draft':
      return { color: '#64748b', bg: '#f8fafc' };
    default:
      return { color: '#b45309', bg: '#fef3c7' };
  }
}

export function daysUntilDue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function dueUrgencyLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)} gün gecikmiş`;
  if (days === 0) return 'Bugün vade';
  if (days === 1) return 'Yarın vade';
  if (days <= 7) return `${days} gün kaldı`;
  return null;
}
