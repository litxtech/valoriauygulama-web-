/**
 * Personele yeni görev atandığında:
 * - Alt sekme "Görevlerim" rozeti
 * - Hamburger menüde "Yeni" etiketi
 * Her biri kendi ack zamanına göre sıfırlanır.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

function hamburgerAckStorageKey(staffId: string) {
  return `staff_hamburger_assign_ack_v1_${staffId}`;
}

function tasksTabAckStorageKey(staffId: string) {
  return `staff_tasks_tab_assign_ack_v1_${staffId}`;
}

async function readAckIso(key: string): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const ackMs = raw ? Date.parse(raw) : 0;
    return Number.isFinite(ackMs) && ackMs > 0 ? new Date(ackMs).toISOString() : null;
  } catch {
    return null;
  }
}

async function countNewAssignments(staffId: string, ackIso: string | null): Promise<number> {
  let q = supabase
    .from('staff_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_staff_id', staffId)
    .in('status', ['pending', 'in_progress']);

  if (ackIso) {
    q = q.gt('created_at', ackIso);
  }

  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

type State = {
  showHamburgerLabel: boolean;
  showTasksTabBadge: boolean;
  pendingHamburgerCount: number;
  pendingTasksTabCount: number;
  refresh: (staffId: string) => Promise<void>;
  markHamburgerMenuOpened: (staffId: string) => Promise<void>;
  markTasksTabOpened: (staffId: string) => Promise<void>;
  bumpFromRealtime: () => void;
};

export const useStaffNewAssignmentHintStore = create<State>((set, get) => ({
  showHamburgerLabel: false,
  showTasksTabBadge: false,
  pendingHamburgerCount: 0,
  pendingTasksTabCount: 0,

  refresh: async (staffId: string) => {
    try {
      const [hamburgerAck, tasksAck] = await Promise.all([
        readAckIso(hamburgerAckStorageKey(staffId)),
        readAckIso(tasksTabAckStorageKey(staffId)),
      ]);

      const [hamburgerCount, tasksCount] = await Promise.all([
        countNewAssignments(staffId, hamburgerAck),
        countNewAssignments(staffId, tasksAck),
      ]);

      set({
        showHamburgerLabel: hamburgerCount > 0,
        pendingHamburgerCount: hamburgerCount,
        showTasksTabBadge: tasksCount > 0,
        pendingTasksTabCount: tasksCount,
      });
    } catch {
      set({
        showHamburgerLabel: false,
        pendingHamburgerCount: 0,
        showTasksTabBadge: false,
        pendingTasksTabCount: 0,
      });
    }
  },

  markHamburgerMenuOpened: async (staffId: string) => {
    await AsyncStorage.setItem(hamburgerAckStorageKey(staffId), new Date().toISOString());
    set({ showHamburgerLabel: false, pendingHamburgerCount: 0 });
  },

  markTasksTabOpened: async (staffId: string) => {
    await AsyncStorage.setItem(tasksTabAckStorageKey(staffId), new Date().toISOString());
    set({ showTasksTabBadge: false, pendingTasksTabCount: 0 });
  },

  bumpFromRealtime: () => {
    const prevH = get().pendingHamburgerCount;
    const prevT = get().pendingTasksTabCount;
    set({
      showHamburgerLabel: true,
      pendingHamburgerCount: Math.max(1, prevH + 1),
      showTasksTabBadge: true,
      pendingTasksTabCount: Math.max(1, prevT + 1),
    });
  },
}));
