import type { Href, Router } from 'expo-router';

/** Hamburger menüden açılan sayfadan geri dönünce menü oturumunu sürdür. */
let pendingReopen = false;

/** Çift dokunuşta menü satırına “hayalet” tıklamayı önlemek için kısa gecikme (ms). */
export const STAFF_HAMBURGER_ITEM_PRESS_GUARD_MS = 320;

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

export function isStaffHamburgerTabHref(href: string): boolean {
  return STAFF_HAMBURGER_TAB_PATHS.has(normStaffMenuHref(href));
}

let hamburgerNavLockUntil = 0;

/** Menü öğesi / çift dokunuş: kısa sürede yinelenen gezinmeyi yoksay. */
export function navigateStaffFromHamburgerMenu(router: Router, href: string): boolean {
  const now = Date.now();
  if (now < hamburgerNavLockUntil) return false;
  hamburgerNavLockUntil = now + 450;

  const target = normStaffMenuHref(href) as Href;
  if (isStaffHamburgerTabHref(href)) {
    router.navigate(target as never);
  } else {
    router.push(target as never);
  }
  return true;
}

export function signalStaffNavigatedFromHamburger() {
  pendingReopen = true;
}

export function clearStaffHamburgerReopenPending() {
  pendingReopen = false;
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
  if (isStaffFeedHomePath(previousPathname)) return false;
  pendingReopen = false;
  return true;
}
