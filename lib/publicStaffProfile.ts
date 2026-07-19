import { supabase } from '@/lib/supabase';

export type PublicStaffProfile = {
  id: string;
  full_name: string;
  department: string | null;
  position: string | null;
  profile_image: string | null;
  cover_image: string | null;
  bio: string | null;
  is_online: boolean | null;
  specialties: string[] | null;
  languages: string[] | null;
  verification_badge: string | null;
  profile_hidden_by_admin: boolean | null;
};

/** Anon erişilebilir — get_staff_public_profile RPC */
export async function fetchPublicStaffProfile(
  staffId: string
): Promise<PublicStaffProfile | null> {
  const id = staffId.trim();
  if (!id) return null;

  const { data, error } = await supabase.rpc('get_staff_public_profile', {
    p_staff_id: id,
  });
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const rid = typeof r.id === 'string' ? r.id : null;
  if (!rid) return null;

  return {
    id: rid,
    full_name: (typeof r.full_name === 'string' && r.full_name.trim()) || '—',
    department: typeof r.department === 'string' ? r.department : null,
    position: typeof r.position === 'string' ? r.position : null,
    profile_image: typeof r.profile_image === 'string' ? r.profile_image : null,
    cover_image: typeof r.cover_image === 'string' ? r.cover_image : null,
    bio: typeof r.bio === 'string' ? r.bio : null,
    is_online: typeof r.is_online === 'boolean' ? r.is_online : null,
    specialties: Array.isArray(r.specialties) ? (r.specialties as string[]) : null,
    languages: Array.isArray(r.languages) ? (r.languages as string[]) : null,
    verification_badge: typeof r.verification_badge === 'string' ? r.verification_badge : null,
    profile_hidden_by_admin:
      typeof r.profile_hidden_by_admin === 'boolean' ? r.profile_hidden_by_admin : null,
  };
}
