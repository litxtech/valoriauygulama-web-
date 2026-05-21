import { adminTheme } from '@/constants/adminTheme';

export type StockLevel = 'empty' | 'critical' | 'low' | 'ok';

export function getStockLevel(current: number, min: number, max: number): StockLevel {
  if (current <= 0) return 'empty';
  if (min > 0 && current <= min) return 'critical';
  if (max > 0 && current <= min * 1.25 && min > 0) return 'low';
  return 'ok';
}

export const STOCK_LEVEL_META: Record<
  StockLevel,
  { label: string; color: string; bg: string; icon: 'alert-circle' | 'warning' | 'checkmark-circle' | 'remove-circle' }
> = {
  empty: { label: 'Tükendi', color: '#b91c1c', bg: '#fee2e2', icon: 'remove-circle' },
  critical: { label: 'Kritik', color: '#b91c1c', bg: '#fee2e2', icon: 'alert-circle' },
  low: { label: 'Azalıyor', color: '#b45309', bg: '#fef3c7', icon: 'warning' },
  ok: { label: 'Yeterli', color: '#047857', bg: '#d1fae5', icon: 'checkmark-circle' },
};

export function stockPercent(current: number, max: number): number {
  if (max <= 0) return current > 0 ? 100 : 0;
  return Math.min(100, Math.round((current / max) * 100));
}

export const stockTheme = {
  headerGrad: ['#0f172a', '#1e3a5f'] as [string, string],
  in: '#059669',
  out: '#d97706',
  card: adminTheme.colors.surface,
};
