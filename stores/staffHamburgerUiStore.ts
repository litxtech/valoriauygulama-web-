import { Platform } from 'react-native';
import { create } from 'zustand';

type State = {
  visible: boolean;
  instant: boolean;
  /** Menüden sayfaya geçerken panel gizlenir, modal opak perde olarak kalır. */
  navigatingAway: boolean;
  /** İlk açılıştan sonra ağır menü ağacını mount et. */
  sheetEverMounted: boolean;
  open: (opts?: { instant?: boolean }) => void;
  close: () => void;
  reopenInstant: () => void;
  markSheetMounted: () => void;
  beginNavTransition: () => void;
  finishNavTransition: () => void;
  /** @deprecated use finishNavTransition — HMR uyumluluğu */
  endNavTransition: () => void;
};

const IS_ANDROID = Platform.OS === 'android';
let navTransitionClearTimer: ReturnType<typeof setTimeout> | null = null;

function clearNavTransitionTimer() {
  if (navTransitionClearTimer) {
    clearTimeout(navTransitionClearTimer);
    navTransitionClearTimer = null;
  }
}

export const useStaffHamburgerUiStore = create<State>((set, get) => ({
  visible: false,
  instant: false,
  navigatingAway: false,
  sheetEverMounted: false,

  open: (opts) => {
    set({
      visible: true,
      instant: opts?.instant ?? IS_ANDROID,
      navigatingAway: false,
      sheetEverMounted: true,
    });
  },

  close: () => {
    clearNavTransitionTimer();
    set({ visible: false, instant: false, navigatingAway: false });
  },

  reopenInstant: () => {
    set({ visible: true, instant: true, navigatingAway: false, sheetEverMounted: true });
  },

  markSheetMounted: () => {
    if (!get().sheetEverMounted) set({ sheetEverMounted: true });
  },

  beginNavTransition: () => {
    clearNavTransitionTimer();
    set({ visible: true, instant: true, navigatingAway: true });
    navTransitionClearTimer = setTimeout(() => {
      navTransitionClearTimer = null;
      set({ visible: false, instant: false, navigatingAway: false });
    }, 650);
  },

  finishNavTransition: () => {
    clearNavTransitionTimer();
    set({ visible: false, instant: true, navigatingAway: false });
  },

  endNavTransition: () => {
    get().finishNavTransition();
  },
}));
