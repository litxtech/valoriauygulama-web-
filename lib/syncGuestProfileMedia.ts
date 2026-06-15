import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@supabase/supabase-js';

function trimUrl(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || null;
}

/**
 * Misafir satırındaki photo_url / cover_image_url → auth user_metadata.
 * Anonim çıkış → tekrar girişte yeni auth uid boş metadata ile gelir; guests satırı cihaz kimliğiyle aynı kalır.
 */
export async function syncGuestProfileMediaToAuth(user: User | null | undefined): Promise<void> {
  if (!user) return;
  const { staff } = useAuthStore.getState();
  if (staff) return;

  const meta = user.user_metadata ?? {};
  const metaAvatar = trimUrl(meta.avatar_url);
  const metaCover = trimUrl(meta.cover_url);

  const { data: guestRow, error: guestErr } = await supabase
    .from('guests')
    .select('photo_url, cover_image_url')
    .eq('auth_user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (guestErr) {
    log.warn('syncGuestProfileMedia', 'guest select', guestErr.message);
    return;
  }
  if (!guestRow) return;

  const dbAvatar = trimUrl(guestRow.photo_url);
  const dbCover = trimUrl(guestRow.cover_image_url);

  const updates: Record<string, string | null> = {};
  if (dbAvatar && dbAvatar !== metaAvatar) updates.avatar_url = dbAvatar;
  if (dbCover && dbCover !== metaCover) updates.cover_url = dbCover;

  if (Object.keys(updates).length === 0) return;

  const next = { ...meta, ...updates };
  const { error } = await supabase.auth.updateUser({ data: next });
  if (error) {
    log.warn('syncGuestProfileMedia', 'updateUser', error.message);
    return;
  }
  await useAuthStore.getState().loadSession();
}

export async function persistGuestCoverImageUrl(coverUrl: string | null): Promise<void> {
  const { error } = await supabase.rpc('update_my_guest_cover_image_url', {
    p_cover_image_url: coverUrl ?? '',
  });
  if (error) throw error;
}

export async function persistGuestPhotoUrl(photoUrl: string | null): Promise<void> {
  const { error } = await supabase.rpc('update_my_guest_photo_url', {
    p_photo_url: photoUrl ?? '',
  });
  if (error) throw error;
}
