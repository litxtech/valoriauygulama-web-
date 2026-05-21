/**
 * Personele yeni görev atandığında hamburger menüde "Yeni" etiketi —
 * menü ilk kez açılana kadar (sonra created_at > ack zamanı ile yenilenir).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

function ackStorageKey(staffId: string) {
  return `staff_hamburger_assign_ack_v1_${staffId}`;
}

type State = {
  showHamburgerLabel: boolean;
  pendingCount: number;
  refresh: (staffId: string) => Promise<void>;
  markHamburgerMenuOpened: (staffId: string) => Promise<void>;
  bumpFromRealtime: () => void;
};

export const useStaffNewAssignmentHintStore = create<State>((set, get) => ({
  showHamburgerLabel: false,
  pendingCount: 0,

  refresh: async (staffId: string) => {
    try {
      const raw = await AsyncStorage.getItem(ackStorageKey(staffId));
      const ackMs = raw ? Date.parse(raw) : 0;
      const ackIso = Number.isFinite(ackMs) && ackMs > 0 ? new Date(ackMs).toISOString() : null;

      let q = supabase
        .from('staff_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_staff_id', staffId)
        .in('status', ['pending', 'in_progress']);

      if (ackIso) {
        q = q.gt('created_at', ackIso);
      }

      const { count, error } = await q;
      if (error) {
        set({ showHamburgerLabel: false, pendingCount: 0 });
        return;
      }
      const n = count ?? 0;
      set({ showHamburgerLabel: n > 0, pendingCount: n });
    } catch {
      set({ showHamburgerLabel: false, pendingCount: 0 });
    }
  },

  markHamburgerMenuOpened: async (staffId: string) => {
    await AsyncStorage.setItem(ackStorageKey(staffId), new Date().toISOString());
    set({ showHamburgerLabel: false, pendingCount: 0 });
  },

  bumpFromRealtime: () => {
    const prev = get().pendingCount;
    set({ showHamburgerLabel: true, pendingCount: Math.max(1, prev + 1) });
  },
}));
