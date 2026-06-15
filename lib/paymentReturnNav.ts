import type { Router } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';
import { dismissTipSheetsForPaymentReturn } from '@/stores/staffTipPaymentStore';

export function resolvePaymentReturnTarget(params: {
  isStaff: boolean;
  isGuest: boolean;
  paymentId?: string;
  referenceType?: string | null;
}): string {
  const { isStaff, isGuest, paymentId, referenceType } = params;

  if (isStaff && paymentId) {
    return `/staff/payments/${paymentId}`;
  }
  if (isStaff) {
    return '/staff/payments';
  }
  if (isGuest) {
    if (referenceType === 'staff_tip') {
      return '/customer/tips';
    }
    if (referenceType === 'guest_extra_order') {
      return '/customer/guest-extras';
    }
    return '/customer/(tabs)';
  }
  return '/';
}

export function navigateFromPaymentReturn(
  router: Router,
  params: Parameters<typeof resolvePaymentReturnTarget>[0]
): void {
  dismissTipSheetsForPaymentReturn();

  if (typeof router.canGoBack === 'function' && router.canGoBack()) {
    router.back();
    return;
  }

  safeRouterReplace(router, resolvePaymentReturnTarget(params));
}
