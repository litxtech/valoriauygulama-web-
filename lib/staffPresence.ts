import { supabase } from '@/lib/supabase';
import { isPostgrestSchemaCacheError, sleepMs } from '@/lib/supabaseTransientErrors';

/** Uygulama açıkken last_active yenilenme aralığı. */
export const STAFF_PRESENCE_HEARTBEAT_MS = 45_000;

/** Bu süreden eski last_active → pratikte çevrim dışı (force-kill / ağ kopması). */
export const STAFF_PRESENCE_STALE_MS = 3 * 60_000;

export function isStaffPresenceFresh(lastActive: string | null | undefined, now = Date.now()): boolean {
  if (!lastActive) return false;
  const t = Date.parse(lastActive);
  if (!Number.isFinite(t)) return false;
  return now - t <= STAFF_PRESENCE_STALE_MS;
}

export function isStaffEffectivelyOnline(
  isOnline: boolean | null | undefined,
  lastActive: string | null | undefined,
  now = Date.now()
): boolean {
  return !!isOnline && isStaffPresenceFresh(lastActive, now);
}

/** Supabase filtreleri için: bu zamandan eski last_active → stale. */
export function staffPresenceFreshCutoffIso(now = Date.now()): string {
  return new Date(now - STAFF_PRESENCE_STALE_MS).toISOString();
}

export async function updateStaffOnlinePresence(staffId: string, online: boolean): Promise<void> {
  const id = String(staffId || '').trim();
  if (!id) return;

  const max = 3;
  for (let a = 1; a <= max; a++) {
    const { error } = await supabase
      .from('staff')
      .update({
        is_online: online,
        last_active: new Date().toISOString(),
      })
      .eq('id', id);
    if (!error) return;
    if (isPostgrestSchemaCacheError(error) && a < max) {
      await sleepMs(300 * a);
      continue;
    }
    if (!isPostgrestSchemaCacheError(error)) {
      console.warn('Staff presence update failed', error.message);
    }
    return;
  }
}
