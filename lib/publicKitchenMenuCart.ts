import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';
import { coverImageUrl } from '@/lib/hotelKitchenMenu';

export type PublicMenuCartLine = {
  itemId: string;
  quantity: number;
  name: string;
  price: number;
  coverUrl: string | null;
};

function storageKey(orgSlug: string) {
  return `valoria_public_menu_cart_${orgSlug.trim().toLowerCase()}`;
}

export function loadPublicMenuCart(orgSlug: string): PublicMenuCartLine[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(storageKey(orgSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PublicMenuCartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l) => l && typeof l.itemId === 'string' && typeof l.quantity === 'number' && l.quantity > 0
    );
  } catch {
    return [];
  }
}

export function savePublicMenuCart(orgSlug: string, lines: PublicMenuCartLine[]) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(orgSlug), JSON.stringify(lines));
  } catch {
    /* quota */
  }
}

export function clearPublicMenuCart(orgSlug: string) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(storageKey(orgSlug));
  } catch {
    /* ignore */
  }
}

export function cartLineFromItem(item: HotelKitchenMenuItemWithImages, quantity = 1): PublicMenuCartLine {
  return {
    itemId: item.id,
    quantity,
    name: item.name,
    price: Number(item.price) || 0,
    coverUrl: coverImageUrl(item),
  };
}

export function mergeCartLine(lines: PublicMenuCartLine[], line: PublicMenuCartLine): PublicMenuCartLine[] {
  const idx = lines.findIndex((l) => l.itemId === line.itemId);
  if (idx < 0) return [...lines, line];
  const next = [...lines];
  next[idx] = { ...next[idx], quantity: Math.min(99, next[idx].quantity + line.quantity) };
  return next;
}

export function setCartQuantity(lines: PublicMenuCartLine[], itemId: string, quantity: number): PublicMenuCartLine[] {
  if (quantity <= 0) return lines.filter((l) => l.itemId !== itemId);
  return lines.map((l) => (l.itemId === itemId ? { ...l, quantity: Math.min(99, quantity) } : l));
}

export function cartTotal(lines: PublicMenuCartLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;
}

export function cartItemCount(lines: PublicMenuCartLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0);
}

export function cartQuantityFor(lines: PublicMenuCartLine[], itemId: string): number {
  return lines.find((l) => l.itemId === itemId)?.quantity ?? 0;
}
