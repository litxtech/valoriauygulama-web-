/**
 * Staff sekmesindeki "Admin" tab → /admin push akışı ile kök layout'taki geri çıkışı senkronlar.
 * Admin'den replace('/staff') yapılınca tab içi navigatedRef sıfırlanmalı; aksi halde bir sonraki girişte push olmaz.
 */
type VoidFn = () => void;
const listeners = new Set<VoidFn>();

export function onStaffExitedAdminPanelFromRoot(fn: VoidFn): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function signalStaffExitedAdminPanelFromRoot() {
  listeners.forEach((fn) => fn());
}
