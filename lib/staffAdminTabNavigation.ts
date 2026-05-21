import type { Href } from 'expo-router';

/**
 * Staff "Admin" sekmesi ↔ kök /admin stack senkronu.
 * Geri ile çıkınca otomatik tekrar push edilmesin diye suppress bayrağı kullanılır.
 */
type VoidFn = () => void;
type RouterReplace = { replace: (href: Href) => void };
const listeners = new Set<VoidFn>();

let suppressAdminAutoOpen = false;

export function isAdminAutoOpenSuppressed(): boolean {
  return suppressAdminAutoOpen;
}

/** Kullanıcı admin sekmesine veya "Panele git" ile bilinçli girdiğinde */
export function clearAdminAutoOpenSuppress(): void {
  suppressAdminAutoOpen = false;
}

export function onStaffExitedAdminPanelFromRoot(fn: VoidFn): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function signalStaffExitedAdminPanelFromRoot() {
  suppressAdminAutoOpen = true;
  listeners.forEach((fn) => fn());
}

/** Geri butonu, Android donanım geri ve kaydırma — hepsi aynı çıkış yolu. */
export function exitAdminPanelToStaffTabs(router: RouterReplace) {
  signalStaffExitedAdminPanelFromRoot();
  router.replace('/staff/(tabs)' as Href);
}
