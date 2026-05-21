/**
 * Misafir mesajlaşma: app_token giriş yapan kullanıcı için otomatik (e-posta ile guest eşleşir veya oluşturulur).
 * Giriş kodu istenmez. AsyncStorage ile kalıcı.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'valoria_guest_messaging_token';

/** Misafir mesaj listesi (customer tabs) — hesap değişiminde/çıkışta temizlenir */
export const GUEST_CUSTOMER_MESSAGES_LIST_CACHE_KEY = 'customer_messages_list_cache_v1';

interface GuestMessagingState {
  appToken: string | null;
  unreadCount: number;
  setAppToken: (token: string | null) => Promise<void>;
  setUnreadCount: (n: number) => void;
  bumpUnread: (delta?: number) => void;
  loadStoredToken: () => Promise<void>;
}

export const useGuestMessagingStore = create<GuestMessagingState>((set, get) => ({
  appToken: null,
  unreadCount: 0,

  setAppToken: async (token) => {
    // Belleği önce güncelle: AsyncStorage await edilirken gönder düğmesi eski token ile RPC çağırıyordu.
    set({ appToken: token });
    try {
      if (token) await AsyncStorage.setItem(KEY, token);
      else await AsyncStorage.removeItem(KEY);
    } catch {
      /* kalıcı yazım hatası; bellek zaten doğru */
    }
  },

  setUnreadCount: (n) => set({ unreadCount: n }),

  bumpUnread: (delta = 1) =>
    set((s) => ({ unreadCount: Math.min(999, Math.max(0, s.unreadCount + delta)) })),

  loadStoredToken: async () => {
    const stored = await AsyncStorage.getItem(KEY);
    set({ appToken: stored });
  },
}));

/** Çıkış veya hesap değişiminde: sunucu token eşleşmesi + yerel sohbet listesi önbelleği kalksın */
export async function clearGuestMessagingLocalState(): Promise<void> {
  await useGuestMessagingStore.getState().setAppToken(null);
  await AsyncStorage.removeItem(GUEST_CUSTOMER_MESSAGES_LIST_CACHE_KEY).catch(() => {});
}
