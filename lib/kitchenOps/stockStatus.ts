import type { KitchenStockItem, KitchenStockStatus } from './types';
import { KITCHEN_LOW_STOCK_THRESHOLD } from './constants';

export function getEffectiveKitchenMinimum(
  item: Pick<KitchenStockItem, 'minimum_quantity'>
): number {
  const min = Number(item.minimum_quantity ?? 0);
  return Math.max(min, KITCHEN_LOW_STOCK_THRESHOLD);
}

/** Kritik stok listesi ve yazdırma filtreleri için. */
export function isKitchenStockLow(
  item: Pick<KitchenStockItem, 'current_quantity' | 'minimum_quantity'>
): boolean {
  const qty = Number(item.current_quantity ?? 0);
  if (qty <= 0) return true;
  return qty <= getEffectiveKitchenMinimum(item);
}

export function getKitchenStockStatus(
  item: Pick<KitchenStockItem, 'current_quantity' | 'minimum_quantity' | 'nearest_expires_at'>
): KitchenStockStatus {
  const qty = Number(item.current_quantity ?? 0);
  const effectiveMin = getEffectiveKitchenMinimum(item);

  if (item.nearest_expires_at) {
    const exp = new Date(item.nearest_expires_at);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (exp < today) return 'expired';
  }

  if (qty <= 0) return 'empty';
  if (qty <= effectiveMin) return 'critical';
  return 'ok';
}

export const KITCHEN_STOCK_STATUS_COLORS: Record<KitchenStockStatus, { bg: string; text: string; label: string }> = {
  ok: { bg: '#ecfdf5', text: '#059669', label: 'Yeterli' },
  low: { bg: '#fffbeb', text: '#d97706', label: 'Azalıyor' },
  critical: { bg: '#fef2f2', text: '#dc2626', label: 'Tedarik et' },
  empty: { bg: '#fef2f2', text: '#dc2626', label: 'Yetersiz' },
  expired: { bg: '#fef2f2', text: '#991b1b', label: 'SKT geçti' },
};

/** PDF ve yazıcı çıktıları için kısa aksiyon metni. */
export function getKitchenStockPrintAction(status: KitchenStockStatus): string {
  if (status === 'empty') return 'Yetersiz';
  if (status === 'critical' || status === 'expired') return 'Tedarik et';
  if (status === 'low') return 'Tedarik et';
  return '—';
}

export function getKitchenStockPrintRowClass(status: KitchenStockStatus): string | undefined {
  if (status === 'empty') return 'row-empty';
  if (status === 'critical' || status === 'expired' || status === 'low') return 'row-low';
  return undefined;
}

export function fmtKitchenQty(qty: number, unit: string): string {
  const n = Number(qty);
  if (Number.isInteger(n)) return `${n} ${unit}`;
  return `${n.toFixed(2).replace(/\.?0+$/, '')} ${unit}`;
}

export function fmtKitchenMoney(n: number): string {
  try {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n) + ' ₺';
  } catch {
    return `${Math.round(n)} ₺`;
  }
}
