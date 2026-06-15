import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerMenu';

export type StaffHamburgerRecentItem = Pick<
  StaffHamburgerMenuItem,
  'id' | 'label' | 'href' | 'icon' | 'accent'
> & {
  usedAt: number;
};

const MAX_RECENTS = 14;
const STORAGE_VERSION = 'v1';

function storageKey(staffId: string) {
  return `staff_hamburger_recents_${STORAGE_VERSION}_${staffId}`;
}

type State = {
  staffId: string | null;
  recents: StaffHamburgerRecentItem[];
  hydrated: boolean;
  hydrate: (staffId: string) => Promise<void>;
  pushRecent: (staffId: string, item: StaffHamburgerMenuItem) => Promise<void>;
  resolveRecents: (available: StaffHamburgerMenuItem[]) => StaffHamburgerMenuItem[];
};

export const useStaffHamburgerRecentsStore = create<State>((set, get) => ({
  staffId: null,
  recents: [],
  hydrated: false,

  hydrate: async (staffId) => {
    if (get().staffId === staffId && get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(storageKey(staffId));
      const parsed = raw ? (JSON.parse(raw) as StaffHamburgerRecentItem[]) : [];
      set({
        staffId,
        recents: Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : [],
        hydrated: true,
      });
    } catch {
      set({ staffId, recents: [], hydrated: true });
    }
  },

  pushRecent: async (staffId, item) => {
    const now = Date.now();
    const entry: StaffHamburgerRecentItem = {
      id: item.id,
      label: item.label,
      href: item.href,
      icon: item.icon,
      accent: item.accent,
      usedAt: now,
    };
    const prev = get().staffId === staffId ? get().recents : [];
    const next = [entry, ...prev.filter((r) => r.id !== item.id)].slice(0, MAX_RECENTS);
    set({ staffId, recents: next, hydrated: true });
    try {
      await AsyncStorage.setItem(storageKey(staffId), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },

  resolveRecents: (available) => {
    const byId = new Map(available.map((item) => [item.id, item]));
    return get()
      .recents.map((r) => byId.get(r.id))
      .filter((item): item is StaffHamburgerMenuItem => !!item);
  },
}));
