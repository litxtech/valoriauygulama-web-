import { create } from 'zustand';

export type AppScreenshotChatContext = {
  conversationId: string;
  conversationName: string;
  isGroup: boolean;
  chatUrl: string;
  actor:
    | { kind: 'staff'; staffId: string; senderName: string }
    | { kind: 'guest'; appToken: string; senderName: string };
  pushBody: string;
  onLocalMessage?: (msg: import('@/lib/messaging').Message) => void;
  ownSenderId?: string;
  reloadStaffMessages?: () => Promise<import('@/lib/messaging').Message[]>;
};

type State = {
  chat: AppScreenshotChatContext | null;
  setChat: (ctx: AppScreenshotChatContext | null) => void;
};

export const useAppScreenshotContextStore = create<State>((set) => ({
  chat: null,
  setChat: (chat) => set({ chat }),
}));
