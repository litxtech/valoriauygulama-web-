import { supabase } from '@/lib/supabase';
import { isOpsSchemaNotExposedError } from '@/lib/supabaseTransientErrors';

export const OPS_SCHEMA_NOT_EXPOSED_MSG =
  'Supabase Data API ayarında «ops» şeması açık değil. Dashboard → Project Settings → Data API → Exposed schemas listesine ops ekleyip kaydedin (1–2 dk bekleyin).';

const ENSURE_MSG: Record<string, string> = {
  PGRST106: OPS_SCHEMA_NOT_EXPOSED_MSG,
  ENSURE_RPC_MISSING:
    'Sunucuda ensure_my_ops_app_user fonksiyonu yok. Migration 304_ops_ensure_app_user_mrz_staff.sql uygulayın.',
  NO_STAFF_ROW: 'Personel kaydı bulunamadı. Yöneticinizle iletişime geçin.',
  STAFF_ROLE_NOT_OPS_ELIGIBLE:
    'Bu hesap için KBS/MRZ otel bağlantısı tanımlı değil. Yöneticiden «Pasaport / MRZ tarama» iznini açmasını isteyin.',
  USER_ID_REQUIRED: 'Oturum geçersiz.',
  AUTH: 'Oturum yok',
};

type EnsureRpc = { ok?: boolean; hotel_id?: string; code?: string; message?: string };

/**
 * Oturumdaki kullanıcı için ops.app_users.hotel_id döner; yoksa RPC ile oluşturur.
 */
export async function resolveOpsHotelIdForCaller(): Promise<
  { ok: true; hotelId: string; userId: string } | { ok: false; message: string; code: string }
> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false, message: 'Oturum yok', code: 'AUTH' };

  // ops şeması PostgREST'te expose değilse doğrudan .schema('ops') → 406 PGRST106 verir; yalnızca public RPC kullan.
  const { data: rpc, error } = await supabase.rpc('ensure_my_ops_app_user');
  if (error) {
    if (isOpsSchemaNotExposedError(error)) {
      return { ok: false, message: ENSURE_MSG.PGRST106, code: 'PGRST106' };
    }
    if (error.code === 'PGRST202' || /ensure_my_ops_app_user/i.test(error.message ?? '')) {
      return { ok: false, message: ENSURE_MSG.ENSURE_RPC_MISSING, code: 'ENSURE_RPC_MISSING' };
    }
    return { ok: false, message: error.message, code: 'ENSURE_RPC' };
  }

  const row = (rpc ?? {}) as EnsureRpc;
  if (row.ok && row.hotel_id) {
    return { ok: true, hotelId: row.hotel_id, userId: uid };
  }

  const code = row.code ?? 'NO_APP_USER';
  const raw = row.message ?? code;
  const message = ENSURE_MSG[code] ?? ENSURE_MSG[raw] ?? 'Bu kullanıcı için ops.app_users kaydı oluşturulamadı.';
  return { ok: false, message, code };
}

/** MRZ/KBS ekranı açılmadan önce arka planda çağrılabilir. */
export function preloadOpsAppUserForSession(): void {
  void resolveOpsHotelIdForCaller();
}
