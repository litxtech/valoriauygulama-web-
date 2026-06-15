import { supabase } from '@/lib/supabase';
import { staffListConversations } from '@/lib/messagingApi';

/** Tek RPC ile personel okunmamış mesaj sayısı (admin panel / tab rozeti). */
export async function fetchStaffMessagingUnreadCount(staffId: string): Promise<number> {
  const { data, error } = await supabase.rpc('messaging_unread_count_staff_caller', {
    p_staff_id: staffId,
  });
  if (!error && data != null) {
    const n = Number(data);
    return Number.isFinite(n) ? Math.max(0, Math.min(999, Math.floor(n))) : 0;
  }
  const list = await staffListConversations(staffId);
  return (list ?? []).reduce((s, c) => s + (c.unread_count ?? 0), 0);
}
