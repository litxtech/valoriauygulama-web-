/** Sunucu mask_staff_display_name_for_privacy ile aynı kural (örn. Ahmet Yılmaz → A*** Y***). */
export function maskStaffDisplayNameForPrivacy(fullName: string | null | undefined): string {
  const t = (fullName ?? '').trim();
  if (!t) return '***';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '***';
  return parts
    .map((p) => (p.length <= 1 ? `${p}***` : `${p.charAt(0)}***`))
    .join(' ');
}

export function shouldRestrictStaffProfileView(opts: {
  profileHiddenByAdmin: boolean;
  viewerStaffId: string | null | undefined;
  viewerRole: string | null | undefined;
  targetStaffId: string;
}): boolean {
  if (!opts.profileHiddenByAdmin) return false;
  if (opts.viewerRole === 'admin') return false;
  if (opts.viewerStaffId && opts.viewerStaffId === opts.targetStaffId) return false;
  return true;
}

export function displayStaffNameForViewer(
  fullName: string | null | undefined,
  profileHiddenByAdmin: boolean | null | undefined,
  viewerMaySeeFullProfile: boolean,
  fallback: string
): string {
  const raw = fullName?.trim();
  if (!raw) return fallback;
  if (!profileHiddenByAdmin || viewerMaySeeFullProfile) return raw;
  return maskStaffDisplayNameForPrivacy(raw);
}

/** Personel tabanından gelen tam satırı; gizli profil ekranında gösterilecek minimum alanlara indirger (istemci tarafı). */
export function buildRestrictedStaffProfileView<T extends Record<string, unknown>>(data: T): T {
  return {
    ...data,
    full_name: maskStaffDisplayNameForPrivacy(data.full_name as string | null | undefined),
    department: null,
    position: null,
    cover_image: null,
    bio: null,
    specialties: null,
    languages: null,
    office_location: null,
    achievements: null,
    phone: null,
    email: null,
    whatsapp: null,
    show_phone_to_guest: false,
    show_email_to_guest: false,
    show_whatsapp_to_guest: false,
    shift: null,
    shift_id: null,
    verification_badge: null,
    evaluation_score: null,
    evaluation_discipline: null,
    evaluation_communication: null,
    evaluation_speed: null,
    evaluation_responsibility: null,
    evaluation_insight: null,
    tenure_note: null,
    organization: null,
    hire_date: null,
    created_at: null,
    average_rating: null,
    total_reviews: null,
    profile_hidden_by_admin: true,
  } as T;
}
