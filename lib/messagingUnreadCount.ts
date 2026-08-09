import { staffListConversations } from '@/lib/messagingApi';

/**
 * Personel okunmamış mesaj sayısı (tab / admin rozeti).
 * Sohbet listesiyle aynı kapsam: arşiv ve silinmiş karşı taraf direct’ler hariç.
 * (Hafif count RPC migration 593 sonrası app ikon rozeti için; istemci doğruluk için liste kullanır.)
 */
export async function fetchStaffMessagingUnreadCount(staffId: string): Promise<number> {
  const list = await staffListConversations(staffId);
  const total = (list ?? []).reduce((s, c) => s + (c.unread_count ?? 0), 0);
  return Math.max(0, Math.min(999, Math.floor(total)));
}
