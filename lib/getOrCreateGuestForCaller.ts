import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { updateGuestLoginInfo } from '@/lib/updateGuestLoginInfo';
import { isOpaqueGuestDisplayString } from '@/lib/guestDisplayName';
import type { Session, User } from '@supabase/supabase-js';
import { getOrCreateGuestDeviceInstallId } from '@/lib/guestDeviceInstallId';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { useAuthStore } from '@/stores/authStore';

/**
 * Apple/Google dahil tüm giriş türlerinde kullanılacak full_name.
 * user_metadata.full_name, name veya email ön eki.
 */
export function getGuestFullNameFromUser(user: User | null | undefined): string | undefined {
  if (!user) return undefined;
  const meta = user.user_metadata ?? {};
  const full = (meta.full_name ?? meta.name ?? '') as string;
  if (full && String(full).trim()) {
    const t = String(full).trim();
    if (!isOpaqueGuestDisplayString(t)) return t;
  }
  const email = (user.email ?? meta.email ?? '') as string;
  if (email && String(email).trim()) {
    const local = String(email).trim().split('@')[0] || '';
    if (local && !isOpaqueGuestDisplayString(local)) return local;
  }
  return undefined;
}

/**
 * Çağıran kullanıcı (auth.uid()) için misafir getir veya oluştur.
 * Apple/Google girişte JWT'de email olmayabilir; 046 migration auth_user_id ile eşleştirir.
 * is_new: bu oturumda yeni kayıt oluşturulduysa true (misafir hesap bildirimi için).
 * Arka planda cihaz/platform/kayıt bilgisi admin panele gönderilir.
 */
export async function getOrCreateGuestForCaller(user: User | null | undefined): Promise<{ guest_id: string; app_token: string; is_new?: boolean } | null> {
  if (!user) return null;
  const { staff, staffCheckComplete } = useAuthStore.getState();
  if (staff) return null;
  if (!staffCheckComplete) return null;
  const fullName = getGuestFullNameFromUser(user);
  /** Cihaz kimliği sunucuda yalnızca anonim JWT + cihaz eşlemesinde kullanılır; her zaman gönderilir (parametre kaybı olmasın). */
  const deviceInstallId = await getOrCreateGuestDeviceInstallId();
  const { data: guestRow, error } = await supabase.rpc('get_or_create_guest_for_caller', {
    p_full_name: fullName ?? null,
    p_device_install_id: deviceInstallId,
  });
  if (error) {
    log.warn('getOrCreateGuestForCaller', 'RPC error', error.message, error.code, error.details);
    return null;
  }
  const row = Array.isArray(guestRow) && guestRow[0]
    ? (guestRow[0] as { guest_id: string; app_token: string; is_new?: boolean })
    : null;
  if (row) {
    updateGuestLoginInfo(user).catch((e) => log.warn('getOrCreateGuestForCaller', 'updateGuestLoginInfo', (e as Error)?.message));
  }
  return row ?? null;
}

/**
 * Oturum varsa ağa refresh sormadan döner; yoksa bir kez refresh dener.
 * Her çağrıda refreshSession kullanma — Supabase 429 (rate limit) ve anon JWT ile RLS 401 riski.
 */
export async function getSessionOrRefreshOnce(): Promise<Session | null> {
  const { data: s0 } = await supabase.auth.getSession();
  if (s0.session?.user) return s0.session;
  try {
    const { data } = await supabase.auth.refreshSession();
    if (data.session?.user) return data.session;
  } catch {
    /* çevrimdışı / limit */
  }
  const { data: s1 } = await supabase.auth.getSession();
  return s1.session?.user ? s1.session : null;
}

/**
 * Session'dan kullanıcı alıp misafir getir/oluştur. Store `user` henüz yokken de çalışır.
 * İlk açılışta oturum boşsa bir kez refresh dener; mevcut oturum varken refresh tetiklemez.
 */
export async function getOrCreateGuestForCurrentSession(): Promise<{
  guest_id: string;
  app_token: string;
  is_new?: boolean;
} | null> {
  const session = await getSessionOrRefreshOnce();
  return getOrCreateGuestForCaller(session?.user ?? null);
}

/**
 * Mesajlaşma RPC'leri `guests.app_token` ile eşitler. Yerel AsyncStorage eski/yanlış token tutarsa
 * sohbet açılmaz. Her kritik ekran öncesi bu fonksiyonla token'ı get_or_create ile tazelenebilir.
 */
export async function syncGuestMessagingAppToken(): Promise<string | null> {
  const session = await getSessionOrRefreshOnce();
  if (!session?.user) return null;
  const row = await getOrCreateGuestForCaller(session.user);
  if (!row?.app_token) return null;
  await useGuestMessagingStore.getState().setAppToken(row.app_token);
  return row.app_token;
}
