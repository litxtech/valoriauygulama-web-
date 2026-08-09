import { create } from 'zustand';

type StaffBottomNavState = {
  /** true = tab bar visible */
  visible: boolean;
  createOpen: boolean;
  setVisible: (v: boolean) => void;
  setCreateOpen: (v: boolean) => void;
  /** Feed scroll helper — hide on down, show on up */
  onScrollDirection: (dir: 'up' | 'down') => void;
};

/**
 * Shared bottom-nav chrome state for staff MainTabs.
 * Feed (and other lists) call onScrollDirection for Instagram-like hide/show.
 */
export const useStaffBottomNavStore = create<StaffBottomNavState>((set, get) => ({
  visible: true,
  createOpen: false,
  setVisible: (v) => {
    if (get().visible === v) return;
    set({ visible: v });
  },
  setCreateOpen: (v) => set({ createOpen: v }),
  onScrollDirection: (dir) => {
    const next = dir === 'up';
    if (get().visible === next) return;
    set({ visible: next });
  },
}));
