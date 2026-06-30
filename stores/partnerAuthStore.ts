import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { fetchPartnerProfile, type BreakfastPartnerProfile } from '@/lib/breakfastPartner';
import { log } from '@/lib/logger';
import { withTimeout } from '@/lib/supabaseTransientErrors';

/** Partner kontrolü açılış yönlendirmesini bekletir; ağ yavaş/erişilemezse (522) takılmasın. */
const PARTNER_RESOLVE_TIMEOUT_MS = 4_000;

interface PartnerAuthState {
  partner: BreakfastPartnerProfile | null;
  partnerCheckComplete: boolean;
  setPartner: (p: BreakfastPartnerProfile | null) => void;
  resolvePartner: (user: User) => Promise<void>;
  clearPartner: () => void;
}

export const usePartnerAuthStore = create<PartnerAuthState>((set) => ({
  partner: null,
  partnerCheckComplete: false,
  setPartner: (partner) => set({ partner, partnerCheckComplete: true }),
  clearPartner: () => set({ partner: null, partnerCheckComplete: false }),
  resolvePartner: async (user) => {
    try {
      const profile = await withTimeout(
        fetchPartnerProfile(user.id),
        PARTNER_RESOLVE_TIMEOUT_MS,
        'partner'
      );
      set({ partner: profile, partnerCheckComplete: true });
    } catch (e) {
      log.warn('partnerAuthStore', 'resolvePartner', (e as Error)?.message);
      set({ partner: null, partnerCheckComplete: true });
    }
  },
}));

export async function resolvePartnerAfterSignIn(user: User): Promise<BreakfastPartnerProfile | null> {
  await usePartnerAuthStore.getState().resolvePartner(user);
  return usePartnerAuthStore.getState().partner;
}

export function clearPartnerSession(): void {
  usePartnerAuthStore.getState().clearPartner();
}
