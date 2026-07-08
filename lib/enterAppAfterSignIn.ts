import type { Router } from 'expo-router';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { usePartnerAppSurfaceStore, resolvePartnerEntryPath } from '@/stores/partnerAppSurfaceStore';
import { useAuthStore } from '@/stores/authStore';
import { hasPolicyConsent } from '@/lib/policyConsent';
import { safeRouterReplace } from '@/lib/safeRouter';

/** Giriş sonrası personel / partner / misafir paneline yönlendir. */
export async function enterAppAfterSignIn(router: Pick<Router, 'replace'>, userId: string): Promise<void> {
  const { staff } = useAuthStore.getState();
  const partner = staff ? null : usePartnerAuthStore.getState().partner;
  const surface = usePartnerAppSurfaceStore.getState().surface;
  const accepted = await hasPolicyConsent(userId);
  let path = '/customer';
  let nextParam = 'customer';
  if (staff) {
    path = '/staff';
    nextParam = 'staff';
  } else if (partner) {
    path = resolvePartnerEntryPath(partner, surface);
    nextParam = 'partner';
  }
  if (accepted) {
    safeRouterReplace(router, path);
  } else {
    safeRouterReplace(router, { pathname: '/policies', params: { next: nextParam } });
  }
}
