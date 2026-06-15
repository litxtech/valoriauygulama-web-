import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'valoria_staff_session_v2';

export type CachedStaffProfile = {
  id: string;
  auth_id: string;
  email: string;
  full_name: string | null;
  role: string;
  department: string | null;
  profile_image?: string | null;
  work_status?: string | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  app_permissions?: Record<string, boolean> | null;
  hidden_menu_item_ids?: string[] | null;
  kbs_access_enabled?: boolean;
  organization_id: string;
  organization?: { name: string; slug?: string | null; kind?: string | null } | null;
};

/** getSession ile paralel okunabilir — auth_id eşleşmesi loadSession içinde yapılır. */
export async function peekStaffSessionCache(): Promise<{
  auth_id: string;
  staff: CachedStaffProfile;
} | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { auth_id?: string; staff?: CachedStaffProfile };
    if (!parsed?.auth_id || !parsed?.staff?.id || parsed.staff.deleted_at) return null;
    return { auth_id: parsed.auth_id, staff: parsed.staff };
  } catch {
    return null;
  }
}

export async function readStaffSessionCache(authId: string): Promise<CachedStaffProfile | null> {
  const peek = await peekStaffSessionCache();
  if (!peek || peek.auth_id !== authId) return null;
  return peek.staff;
}

export async function writeStaffSessionCache(authId: string, staff: CachedStaffProfile): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ auth_id: authId, staff }));
  } catch {
    // ignore
  }
}

export async function clearStaffSessionCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
