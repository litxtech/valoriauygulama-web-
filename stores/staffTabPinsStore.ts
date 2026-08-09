import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { moveInList } from '@/lib/staffHamburgerLayoutConfig';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerTypes';

/** Alt tab’ta ana sayfa dışında en fazla bu kadar sekme */
export const STAFF_TAB_MAX_PINS = 8;
/** v2: Mesaj / Kimlik / Admin / Profil pin olarak düzenlenebilir */
const STORAGE_VERSION = 'v2';

function storageKey(staffId: string) {
  return `staff_tab_pins_${STORAGE_VERSION}_${staffId}`;
}

function normalizeIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const id = x.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= STAFF_TAB_MAX_PINS) break;
  }
  return out;
}

type State = {
  staffId: string | null;
  pinnedIds: string[];
  hydrated: boolean;
  hydrate: (staffId: string) => Promise<void>;
  isPinned: (itemId: string) => boolean;
  togglePin: (staffId: string, itemId: string) => Promise<boolean>;
  movePin: (staffId: string, itemId: string, direction: -1 | 1) => Promise<void>;
  setPinnedOrder: (staffId: string, ids: string[]) => Promise<void>;
  clearPins: (staffId: string) => Promise<void>;
  resolvePinned: (available: StaffHamburgerMenuItem[]) => StaffHamburgerMenuItem[];
};

async function persist(staffId: string, pinnedIds: string[]) {
  try {
    await AsyncStorage.setItem(storageKey(staffId), JSON.stringify(pinnedIds));
  } catch {
    /* ignore */
  }
}

export const useStaffTabPinsStore = create<State>((set, get) => ({
  staffId: null,
  pinnedIds: [],
  hydrated: false,

  hydrate: async (staffId) => {
    if (get().staffId === staffId && get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(storageKey(staffId));
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      set({
        staffId,
        pinnedIds: normalizeIds(parsed),
        hydrated: true,
      });
    } catch {
      set({ staffId, pinnedIds: [], hydrated: true });
    }
  },

  isPinned: (itemId) => get().pinnedIds.includes(itemId),

  togglePin: async (staffId, itemId) => {
    const prev = get().staffId === staffId ? get().pinnedIds : [];
    const exists = prev.includes(itemId);
    let next: string[];
    let pinned: boolean;
    if (exists) {
      next = prev.filter((id) => id !== itemId);
      pinned = false;
    } else {
      if (prev.length >= STAFF_TAB_MAX_PINS) {
        return false;
      }
      next = [...prev, itemId];
      pinned = true;
    }
    set({ staffId, pinnedIds: next, hydrated: true });
    await persist(staffId, next);
    return pinned;
  },

  movePin: async (staffId, itemId, direction) => {
    const prev = get().staffId === staffId ? get().pinnedIds : [];
    const next = moveInList(prev, itemId, direction);
    if (next === prev || next.join() === prev.join()) return;
    set({ staffId, pinnedIds: next, hydrated: true });
    await persist(staffId, next);
  },

  setPinnedOrder: async (staffId, ids) => {
    const next = normalizeIds(ids);
    set({ staffId, pinnedIds: next, hydrated: true });
    await persist(staffId, next);
  },

  clearPins: async (staffId) => {
    set({ staffId, pinnedIds: [], hydrated: true });
    await persist(staffId, []);
  },

  resolvePinned: (available) => {
    const byId = new Map(available.map((item) => [item.id, item]));
    return get()
      .pinnedIds.map((id) => byId.get(id))
      .filter((item): item is StaffHamburgerMenuItem => !!item);
  },
}));
