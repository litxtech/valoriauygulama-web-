import { supabase } from '@/lib/supabase';
import { SOLE_ADMIN_UID } from '@/constants/soleAdmin';

export const QR_COMPLAINT_META_KEY = 'qr_complaint_public_meta';

export type QrComplaintPublicMeta = {
  staff_id: string | null;
  title: string;
  brands: string;
  note: string;
  name_override: string | null;
  photo_override: string | null;
};

export const DEFAULT_QR_COMPLAINT_META: QrComplaintPublicMeta = {
  staff_id: null,
  title: 'Valoria Hotel & Bavulsuite Sorumlusu',
  brands: 'Valoria Hotel · Bavulsuite',
  note: 'Anlık şikayet değerlendirilir. Mesajınız doğrudan sorumlu yöneticiye iletilir — giriş yapmanız gerekmez.',
  name_override: null,
  photo_override: null,
};

function asMeta(raw: unknown): QrComplaintPublicMeta {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    staff_id: typeof o.staff_id === 'string' ? o.staff_id : null,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : DEFAULT_QR_COMPLAINT_META.title,
    brands:
      typeof o.brands === 'string' && o.brands.trim() ? o.brands.trim() : DEFAULT_QR_COMPLAINT_META.brands,
    note: typeof o.note === 'string' && o.note.trim() ? o.note.trim() : DEFAULT_QR_COMPLAINT_META.note,
    name_override:
      typeof o.name_override === 'string' && o.name_override.trim() ? o.name_override.trim() : null,
    photo_override:
      typeof o.photo_override === 'string' && o.photo_override.trim() ? o.photo_override.trim() : null,
  };
}

export async function fetchQrComplaintPublicMeta(): Promise<QrComplaintPublicMeta> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', QR_COMPLAINT_META_KEY)
    .maybeSingle();
  return asMeta((data as { value?: unknown } | null)?.value);
}

export async function saveQrComplaintPublicMeta(
  meta: QrComplaintPublicMeta
): Promise<{ error?: string }> {
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: QR_COMPLAINT_META_KEY,
      value: {
        staff_id: meta.staff_id,
        title: meta.title,
        brands: meta.brands,
        note: meta.note,
        name_override: meta.name_override,
        photo_override: meta.photo_override,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  return error ? { error: error.message } : {};
}

export type ResponsiblePreview = {
  id: string | null;
  full_name: string;
  profile_image: string | null;
};

/** Önizleme: seçili staff veya sole admin profili */
export async function fetchResponsibleStaffPreview(
  staffId?: string | null
): Promise<ResponsiblePreview | null> {
  if (staffId) {
    const { data } = await supabase
      .from('staff')
      .select('id, full_name, profile_image')
      .eq('id', staffId)
      .maybeSingle();
    if (data) {
      return {
        id: data.id,
        full_name: data.full_name?.trim() || '—',
        profile_image: data.profile_image,
      };
    }
  }
  const { data: sole } = await supabase
    .from('staff')
    .select('id, full_name, profile_image')
    .eq('auth_id', SOLE_ADMIN_UID)
    .maybeSingle();
  if (sole) {
    return {
      id: sole.id,
      full_name: sole.full_name?.trim() || 'Soner',
      profile_image: sole.profile_image,
    };
  }
  return null;
}

export async function listAdminStaffForResponsiblePick(): Promise<
  { id: string; full_name: string; profile_image: string | null }[]
> {
  const { data } = await supabase
    .from('staff')
    .select('id, full_name, profile_image')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('full_name');
  return (data ?? []).map((r) => ({
    id: r.id,
    full_name: r.full_name?.trim() || '—',
    profile_image: r.profile_image,
  }));
}
