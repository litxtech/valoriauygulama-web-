import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

/** Yeni misafir uygulama hesabı: admin bilgilendirme + misafire hoş geldin bildirimi (edge function). */
export async function invokeNotifyNewGuestAccount(guestId: string): Promise<void> {
  if (!guestId?.trim()) return;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const { data, error } = await supabase.functions.invoke('notify-new-guest-account', {
      body: { guest_id: guestId.trim() },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      log.warn('notifyNewGuestAccount', 'invoke error', error.message);
      return;
    }
    const payload = data as { error?: string; skipped?: boolean } | null;
    if (payload?.error) log.warn('notifyNewGuestAccount', payload.error);
  } catch (e) {
    log.warn('notifyNewGuestAccount', (e as Error)?.message);
  }
}
