import { create } from 'zustand';

export type MessagePushToastPayload = {
  id: string;
  senderName: string;
  body: string;
  subtitle?: string;
  conversationId?: string;
  url?: string;
  isGroup?: boolean;
  avatarUri?: string;
};

type State = {
  pending: MessagePushToastPayload | null;
  show: (payload: Omit<MessagePushToastPayload, 'id'>) => void;
  dismiss: () => void;
};

export const useMessagePushToastStore = create<State>((set) => ({
  pending: null,
  show: (payload) =>
    set({
      pending: {
        ...payload,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    }),
  dismiss: () => set({ pending: null }),
}));
