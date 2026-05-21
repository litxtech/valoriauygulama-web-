import { create } from 'zustand';
import { staffListConversations } from '@/lib/messagingApi';

interface StaffUnreadState {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  bumpUnread: (delta?: number) => void;
  refreshUnread: (staffId: string) => Promise<void>;
}

export const useStaffUnreadMessagesStore = create<StaffUnreadState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (n) => set({ unreadCount: n }),
  bumpUnread: (delta = 1) =>
    set((s) => ({ unreadCount: Math.min(999, Math.max(0, s.unreadCount + delta)) })),
  refreshUnread: async (staffId) => {
    const list = await staffListConversations(staffId);
    const total = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
    set({ unreadCount: total });
  },
}));
