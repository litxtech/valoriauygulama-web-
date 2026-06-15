import { supabase } from '@/lib/supabase';

/** Profil satırında tips_enabled açıkça var mı? */
export function tipsEnabledFromProfileRow(
  row: Record<string, unknown> | null | undefined
): boolean | undefined {
  if (!row || !Object.prototype.hasOwnProperty.call(row, 'tips_enabled')) {
    return undefined;
  }
  const v = row.tips_enabled;
  if (v === false) return false;
  if (v === true) return true;
  return undefined;
}

function isMissingTipsEnabledColumn(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('tips_enabled') || m.includes('does not exist') || /schema cache/i.test(m);
}

function rpcTipsEnabledTrue(data: unknown): boolean | undefined {
  if (data === true) return true;
  if (data === false) return false;
  return undefined;
}

/**
 * Misafir profili: bahşiş butonu yalnızca açıkça izin varsa true.
 * Belirsiz / hata durumunda false (yanlışlıkla buton göstermemek için).
 */
export async function resolveStaffTipsEnabledForGuest(
  staffId: string,
  profileRow: Record<string, unknown>
): Promise<boolean> {
  const fromProfile = tipsEnabledFromProfileRow(profileRow);
  if (fromProfile === false) return false;
  if (fromProfile === true) return true;

  const { data: rpcVal, error: rpcErr } = await supabase.rpc('get_staff_tips_enabled', {
    p_staff_id: staffId,
  });
  if (!rpcErr) {
    const parsed = rpcTipsEnabledTrue(rpcVal);
    if (parsed !== undefined) return parsed;
  }

  const { data, error } = await supabase
    .from('staff')
    .select('tips_enabled')
    .eq('id', staffId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!error && data && Object.prototype.hasOwnProperty.call(data, 'tips_enabled')) {
    return data.tips_enabled === true;
  }

  if (error && isMissingTipsEnabledColumn(String(error.message ?? ''))) {
    return true;
  }

  return false;
}
