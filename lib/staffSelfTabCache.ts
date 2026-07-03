import type { CachedStaffProfile } from '@/lib/staffSessionCache';

type StaffSelfTabCachePayload = {
  profile: Record<string, unknown>;
  salaryPayments?: unknown[];
};

const memory = new Map<string, StaffSelfTabCachePayload>();

export function staffSelfTabCacheKey(staffId: string): string {
  return `staff_tab_self_v1_${staffId}`;
}

export function peekStaffSelfTabCache<TProfile, TSalary>(
  staffId: string
): { profile: TProfile; salaryPayments: TSalary[] } | null {
  const hit = memory.get(staffId);
  if (!hit?.profile) return null;
  return {
    profile: hit.profile as TProfile,
    salaryPayments: (Array.isArray(hit.salaryPayments) ? hit.salaryPayments : []) as TSalary[],
  };
}

export function writeStaffSelfTabMemoryCache(
  staffId: string,
  profile: Record<string, unknown>,
  salaryPayments: unknown[]
): void {
  memory.set(staffId, { profile, salaryPayments });
}

export function staffProfileFromAuth(auth: CachedStaffProfile): Record<string, unknown> {
  return {
    id: auth.id,
    full_name: auth.full_name,
    department: auth.department,
    profile_image: auth.profile_image ?? null,
    cover_image: null,
    bio: null,
    specialties: null,
    languages: null,
    is_online: auth.work_status === 'active',
    total_reviews: null,
    average_rating: null,
    position: null,
    hire_date: null,
    office_location: null,
    achievements: null,
    phone: null,
    email: auth.email ?? null,
    whatsapp: null,
    show_phone_to_guest: null,
    show_email_to_guest: null,
    show_whatsapp_to_guest: null,
    verification_badge: null,
    shift: null,
    app_permissions: auth.app_permissions ?? null,
    created_at: null,
    tenure_note: null,
  };
}
