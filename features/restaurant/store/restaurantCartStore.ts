import { create } from 'zustand';
import type { PublicMenuCartLine } from '@/lib/publicKitchenMenuCart';
import {
  cartItemCount,
  cartTotal,
  loadPublicMenuCart,
  mergeCartLine,
  savePublicMenuCart,
  setCartQuantity,
} from '@/lib/publicKitchenMenuCart';

type RestaurantCartState = {
  orgSlug: string | null;
  lines: PublicMenuCartLine[];
  hydrate: (orgSlug: string) => void;
  setLines: (lines: PublicMenuCartLine[]) => void;
  addLine: (line: PublicMenuCartLine) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clear: () => void;
  itemCount: () => number;
  total: () => number;
};

export const useRestaurantCartStore = create<RestaurantCartState>((set, get) => ({
  orgSlug: null,
  lines: [],
  hydrate: (orgSlug) => {
    const key = orgSlug.trim().toLowerCase();
    set({ orgSlug: key, lines: loadPublicMenuCart(key) });
  },
  setLines: (lines) => {
    const slug = get().orgSlug;
    if (slug) savePublicMenuCart(slug, lines);
    set({ lines });
  },
  addLine: (line) => {
    const next = mergeCartLine(get().lines, line);
    get().setLines(next);
  },
  updateQuantity: (itemId, quantity) => {
    const next = setCartQuantity(get().lines, itemId, quantity);
    get().setLines(next);
  },
  clear: () => {
    get().setLines([]);
  },
  itemCount: () => cartItemCount(get().lines),
  total: () => cartTotal(get().lines),
}));
