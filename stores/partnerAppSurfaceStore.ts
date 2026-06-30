import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Router } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import type { BreakfastPartnerProfile } from '@/lib/breakfastPartner';

const STORAGE_KEY = 'partner_app_surface_v1';

export type PartnerAppSurface = 'portal' | 'main';

interface PartnerAppSurfaceState {
  surface: PartnerAppSurface;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSurface: (surface: PartnerAppSurface) => Promise<void>;
}

export const usePartnerAppSurfaceStore = create<PartnerAppSurfaceState>((set) => ({
  surface: 'portal',
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const surface: PartnerAppSurface = raw === 'main' ? 'main' : 'portal';
      set({ surface, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
  setSurface: async (surface) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, surface);
    } catch {
      /* ignore */
    }
    set({ surface, hydrated: true });
  },
}));

export function resolvePartnerEntryPath(
  partner: Pick<BreakfastPartnerProfile, 'isPortalActive'> | null | undefined,
  surface: PartnerAppSurface = 'portal'
): string {
  if (!partner) return '/customer';
  if (!partner.isPortalActive) return '/partner/pending';
  return surface === 'main' ? '/customer' : '/partner';
}

export async function switchPartnerToMainApp(router: Pick<Router, 'replace'>): Promise<void> {
  await usePartnerAppSurfaceStore.getState().setSurface('main');
  safeRouterReplace(router, '/customer');
}

export async function switchPartnerToPortal(router: Pick<Router, 'replace'>): Promise<void> {
  const partner = usePartnerAuthStore.getState().partner;
  await usePartnerAppSurfaceStore.getState().setSurface('portal');
  safeRouterReplace(router, resolvePartnerEntryPath(partner, 'portal'));
}
