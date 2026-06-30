import { create } from 'zustand';

interface PartnerMessagingState {
  unreadCount: number;
  setUnreadCount: (n: number) => void;
  bumpUnread: (delta?: number) => void;
}

export const usePartnerMessagingStore = create<PartnerMessagingState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (n) => set({ unreadCount: n }),
  bumpUnread: (delta = 1) =>
    set((s) => ({ unreadCount: Math.min(999, Math.max(0, s.unreadCount + delta)) })),
}));
