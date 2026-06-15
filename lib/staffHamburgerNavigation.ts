import type { Href, Router } from 'expo-router';
import { clearAdminAutoOpenSuppress } from '@/lib/staffAdminTabNavigation';

export type StaffHamburgerMenuRestoreTarget = {
  itemId: string | null;
  scrollY: number | null;
};

/** Hamburger menüden açılan sayfadan geri dönünce menü oturumunu sürdür. */
let pendingReopen = false;
let lastMenuItemId: string | null = null;
let lastMenuScrollY: number | null = null;

export function isStaffHamburgerReopenPending(): boolean {
  return pendingReopen;
}

/** Çift dokunuşta menü satırına “hayalet” tıklamayı önlemek için kısa gecikme (ms). */
export const STAFF_HAMBURGER_ITEM_PRESS_GUARD_MS = 96;

/** Alt sekme rotaları — push yerine navigate (çift tıklamada stack birikmez). */
const STAFF_HAMBURGER_TAB_PATHS = new Set([
  '/staff',
  '/staff/tasks',
  '/staff/stock',
  '/staff/messages',
  '/staff/emergency',
  '/staff/acceptances',
  '/staff/admin',
  '/staff/profile',
]);

function normStaffMenuHref(href: string): string {
  return href.replace(/\/+$/, '') || '/staff';
}

const ADMIN_KITCHEN_OPS_HAMBURGER_PATHS = new Set(['/admin/kitchen-ops', '/admin/kitchen-ops/index']);

export function isAdminKitchenOpsHamburgerHref(href: string): boolean {
  return ADMIN_KITCHEN_OPS_HAMBURGER_PATHS.has(normStaffMenuHref(href));
}

export function isStaffHamburgerTabHref(href: string): boolean {
  return STAFF_HAMBURGER_TAB_PATHS.has(normStaffMenuHref(href));
}

let hamburgerNavLockUntil = 0;

/** Menü öğesi / çift dokunuş: kısa sürede yinelenen gezinmeyi yoksay. */
export function navigateStaffFromHamburgerMenu(router: Router, href: string): boolean {
  const now = Date.now();
  if (now < hamburgerNavLockUntil) return false;
  hamburgerNavLockUntil = now + 80;

  const normalized = normStaffMenuHref(href);
  if (normalized === '/staff/admin') {
    clearAdminAutoOpenSuppress();
    router.push('/admin' as Href);
    return true;
  }
  const target = normalized as Href;
  if (isStaffHamburgerTabHref(href) || isAdminKitchenOpsHamburgerHref(href)) {
    router.navigate(target as never);
  } else {
    router.push(target as never);
  }
  return true;
}

export function signalStaffNavigatedFromHamburger(target?: { itemId?: string; scrollY?: number }) {
  pendingReopen = true;
  lastMenuItemId = target?.itemId ?? null;
  lastMenuScrollY = target?.scrollY ?? null;
}

export function clearStaffHamburgerReopenPending() {
  pendingReopen = false;
  lastMenuItemId = null;
  lastMenuScrollY = null;
}

export function peekStaffHamburgerMenuRestore(): StaffHamburgerMenuRestoreTarget {
  return { itemId: lastMenuItemId, scrollY: lastMenuScrollY };
}

export function clearStaffHamburgerMenuRestore() {
  lastMenuItemId = null;
  lastMenuScrollY = null;
}

/** Personel feed ana ekranı (hamburger burada). */
export function isStaffFeedHomePath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? '').replace(/\/+$/, '') || '/staff';
  return p === '/staff' || p === '/staff/(tabs)' || p === '/staff/(tabs)/index';
}

/** Stack veya başka sekmeden feed köküne dönüldüyse ve menüden gelindiyse menüyü anında göster. */
export function shouldReopenStaffHamburgerOnFeedReturn(
  previousPathname: string | null | undefined,
  currentPathname: string | null | undefined
): boolean {
  if (!pendingReopen) return false;
  if (!isStaffFeedHomePath(currentPathname)) return false;
  const prev = (previousPathname ?? '').replace(/\/+$/, '') || '/staff';
  const current = (currentPathname ?? '').replace(/\/+$/, '') || '/staff';
  const prevOnFeed = isStaffFeedHomePath(previousPathname);
  // Alt sayfadan feed'e dönüş veya stack pop sonrası sekmelerin yeniden mount'u.
  if (!prevOnFeed || prev === current) {
    pendingReopen = false;
    return true;
  }
  return false;
}
