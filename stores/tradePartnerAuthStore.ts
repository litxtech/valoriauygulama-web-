import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { fetchTradePartnerProfileForAuth, type TradePartnerProfile } from '@/lib/tradePartner';

interface TradePartnerAuthState {
  partner: TradePartnerProfile | null;
  partnerCheckComplete: boolean;
  resolvePartner: (user: User | null) => Promise<void>;
  clearPartner: () => void;
}

export const useTradePartnerAuthStore = create<TradePartnerAuthState>((set) => ({
  partner: null,
  partnerCheckComplete: false,
  resolvePartner: async (user) => {
    if (!user) {
      set({ partner: null, partnerCheckComplete: true });
      return;
    }
    try {
      const profile = await fetchTradePartnerProfileForAuth();
      set({ partner: profile, partnerCheckComplete: true });
    } catch {
      set({ partner: null, partnerCheckComplete: true });
    }
  },
  clearPartner: () => set({ partner: null, partnerCheckComplete: true }),
}));

export function clearTradePartnerSession(): void {
  useTradePartnerAuthStore.getState().clearPartner();
}
