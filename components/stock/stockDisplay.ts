export type StockQtyLevel = 'empty' | 'critical' | 'ok';

export function getSimpleStockLevel(current: number, minStock?: number | null): StockQtyLevel {
  if (current <= 0) return 'empty';
  const min = minStock ?? 0;
  if (min > 0 ? current <= min : current <= 3) return 'critical';
  return 'ok';
}

export const STOCK_QTY_LEVEL_COLORS: Record<StockQtyLevel, { fg: string; bg: string; border: string }> = {
  empty: { fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  critical: { fg: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  ok: { fg: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
};

export function formatStockQty(current: number, unit: string | null | undefined): string {
  const u = (unit?.trim() || 'adet').toLowerCase();
  return `${current} ${u}`;
}
