import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  computeStaffBoardEyeState,
  fetchStaffAnnouncements,
  type StaffAnnouncementRow,
} from '@/lib/staffBoard';

const TOAST_SHOWN_KEY = 'staff_board_toast_shown_v1';
const MAX_TOAST_IDS = 80;

type State = {
  unreadCount: number;
  eyeVisible: boolean;
  hasUnread: boolean;
  announcements: StaffAnnouncementRow[];
  loading: boolean;
  pendingToast: StaffAnnouncementRow | null;
  refresh: (staffId: string) => Promise<void>;
  loadList: (staffId: string) => Promise<void>;
  dismissToast: () => void;
};

let toastShownIds: Set<string> | null = null;

async function loadToastShownIds(): Promise<Set<string>> {
  if (toastShownIds) return toastShownIds;
  try {
    const raw = await AsyncStorage.getItem(TOAST_SHOWN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    toastShownIds = new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    toastShownIds = new Set();
  }
  return toastShownIds;
}

async function markToastShown(id: string): Promise<void> {
  const set = await loadToastShownIds();
  set.add(id);
  const arr = [...set].slice(-MAX_TOAST_IDS);
  toastShownIds = new Set(arr);
  await AsyncStorage.setItem(TOAST_SHOWN_KEY, JSON.stringify(arr));
}

function pickNewestUnread(list: StaffAnnouncementRow[]): StaffAnnouncementRow | null {
  const unread = list.filter((a) => !a.read_at);
  if (unread.length === 0) return null;
  return [...unread].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0];
}

async function applyAnnouncements(
  list: StaffAnnouncementRow[],
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void,
  get: () => State
) {
  const eye = computeStaffBoardEyeState(list);
  const shown = await loadToastShownIds();
  const newestUnread = pickNewestUnread(list);
  const shouldToast = newestUnread && !shown.has(newestUnread.id) ? newestUnread : null;

  set({
    announcements: list,
    unreadCount: eye.unreadCount,
    eyeVisible: eye.visible,
    hasUnread: eye.hasUnread,
    loading: false,
    pendingToast: shouldToast ?? get().pendingToast,
  });
}

export const useStaffBoardStore = create<State>((set, get) => ({
  unreadCount: 0,
  eyeVisible: false,
  hasUnread: false,
  announcements: [],
  loading: false,
  pendingToast: null,

  refresh: async (staffId: string) => {
    try {
      const list = await fetchStaffAnnouncements(staffId);
      await applyAnnouncements(list, set, get);
    } catch {
      set({ unreadCount: 0, eyeVisible: false, hasUnread: false });
    }
  },

  loadList: async (staffId: string) => {
    set({ loading: true });
    try {
      const list = await fetchStaffAnnouncements(staffId);
      await applyAnnouncements(list, set, get);
    } catch {
      set({ announcements: [], loading: false, eyeVisible: false, hasUnread: false });
    }
  },

  dismissToast: () => {
    const current = get().pendingToast;
    if (current?.id) {
      void markToastShown(current.id);
    }
    set({ pendingToast: null });
  },
}));
