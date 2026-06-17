import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { clearGuestMessagingLocalState } from '@/stores/guestMessagingStore';
import type { User } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { savePushTokenForStaff } from '@/lib/notificationsPush';
import { isPostgrestSchemaCacheError, isSupabaseUnavailableError, sleepMs, withTimeout } from '@/lib/supabaseTransientErrors';
import {
  peekStaffSessionCache,
  readStaffSessionCache,
  writeStaffSessionCache,
  clearStaffSessionCache,
  type CachedStaffProfile,
} from '@/lib/staffSessionCache';
import { normalizeHiddenMenuItemIds } from '@/lib/staffMenuCatalog';
import { clearLastRoute } from '@/lib/lastRoutePersistence';

const STAFF_FETCH_TIMEOUT_MS = 8_000;
const STAFF_RETRY_FAST_MAX = 3;
const STAFF_RETRY_SLOW_MS = 45_000;
const SESSION_FETCH_TIMEOUT_MS = 10_000;
const STAFF_BOOT_WATCHDOG_MS = 12_000;

const STAFF_SELECT_LEAN =
  'id, auth_id, email, full_name, role, department, profile_image, work_status, is_active, banned_until, deleted_at, app_permissions, organization_id, hidden_menu_item_ids, account_locked';

type StaffRow = {
  id: string;
  auth_id: string;
  email: string;
  full_name: string | null;
  role: string;
  department: string | null;
  profile_image?: string | null;
  work_status?: string | null;
  is_active?: boolean;
  banned_until?: string | null;
  deleted_at?: string | null;
  app_permissions?: Record<string, boolean> | unknown;
  organization_id: string | null;
  hidden_menu_item_ids?: unknown;
  account_locked?: boolean | null;
};

export type StaffProfile = CachedStaffProfile;

type StaffResolveResult =
  | { status: 'staff'; staff: StaffProfile }
  | { status: 'guest' }
  | { status: 'unknown'; reason: string };

interface AuthState {
  user: User | null;
  staff: StaffProfile | null;
  loading: boolean;
  staffCheckComplete: boolean;
  staffCheckUnavailable: boolean;
  setUser: (u: User | null) => void;
  setStaff: (s: StaffProfile | null) => void;
  loadSession: () => Promise<void>;
  waitForStaffCheck: () => Promise<void>;
  retryStaffCheck: () => Promise<void>;
  signOut: () => Promise<void>;
}

let loadSessionPromise: Promise<void> | null = null;
let staffCheckPromise: Promise<void> | null = null;
let staffRetryTimer: ReturnType<typeof setTimeout> | null = null;
let staffFastRetryCount = 0;
let staffRetryUserId: string | null = null;
let lastStaffCheckUserId: string | null = null;
let staffBootWatchdogTimer: ReturnType<typeof setTimeout> | null = null;

function clearStaffBootWatchdog() {
  if (staffBootWatchdogTimer) {
    clearTimeout(staffBootWatchdogTimer);
    staffBootWatchdogTimer = null;
  }
}

function scheduleStaffBootWatchdog(userId: string) {
  clearStaffBootWatchdog();
  staffBootWatchdogTimer = setTimeout(() => {
    staffBootWatchdogTimer = null;
    void (async () => {
      const s = useAuthStore.getState();
      if (s.user?.id !== userId || s.staffCheckComplete) return;
      log.warn('authStore', 'staff boot watchdog — önbellek ile devam');
      clearStaffRetryTimer();
      const cached = await readStaffSessionCache(userId);
      const existingStaff = s.staff?.auth_id === userId ? s.staff : null;
      const staff =
        existingStaff ?? (cached && !cached.deleted_at ? cached : null);
      lastStaffCheckUserId = userId;
      if (staff) hydrateOrg(staff);
      useAuthStore.setState({
        staffCheckComplete: true,
        staffCheckUnavailable: !staff,
        staff,
        loading: false,
      });
    })();
  }, STAFF_BOOT_WATCHDOG_MS);
}

function clearStaffRetryTimer() {
  if (staffRetryTimer) {
    clearTimeout(staffRetryTimer);
    staffRetryTimer = null;
  }
}

function staffFromRow(row: StaffRow, org?: StaffProfile['organization']): StaffProfile | null {
  if (row.deleted_at) return null;
  if (row.banned_until && new Date(row.banned_until) > new Date()) return null;
  if (row.is_active === false) return null;

  const perms =
    typeof row.app_permissions === 'object' && row.app_permissions !== null && !Array.isArray(row.app_permissions)
      ? (row.app_permissions as Record<string, boolean>)
      : null;

  return {
    id: row.id,
    auth_id: row.auth_id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    department: row.department,
    profile_image: row.profile_image,
    work_status: row.work_status,
    banned_until: row.banned_until,
    deleted_at: row.deleted_at,
    account_locked: row.account_locked === true,
    app_permissions: perms,
    hidden_menu_item_ids: normalizeHiddenMenuItemIds(row.hidden_menu_item_ids),
    kbs_access_enabled: true,
    organization_id: row.organization_id ?? '',
    organization: org ?? null,
  };
}

function isStaffRpcMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === 'PGRST202') return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('get_my_staff_session') || m.includes('could not find the function');
}

async function fetchStaffRowViaTable(authId: string): Promise<{ row: StaffRow | null; error: string | null }> {
  const res = await withTimeout(
    supabase.from('staff').select(STAFF_SELECT_LEAN).eq('auth_id', authId).maybeSingle(),
    STAFF_FETCH_TIMEOUT_MS,
    'staff'
  );
  if (!res.error) return { row: res.data as StaffRow | null, error: null };
  return { row: null, error: res.error.message };
}

async function fetchStaffRow(authId: string): Promise<{ row: StaffRow | null; error: string | null }> {
  try {
    const rpc = await withTimeout(supabase.rpc('get_my_staff_session'), STAFF_FETCH_TIMEOUT_MS, 'staff_rpc');
    if (!rpc.error) {
      const raw = rpc.data;
      const row = (Array.isArray(raw) ? raw[0] : raw) as StaffRow | null | undefined;
      return { row: row ?? null, error: null };
    }
    if (!isStaffRpcMissing(rpc.error)) {
      if (isPostgrestSchemaCacheError(rpc.error)) {
        await sleepMs(500);
        const rpc2 = await withTimeout(supabase.rpc('get_my_staff_session'), STAFF_FETCH_TIMEOUT_MS, 'staff_rpc');
        if (!rpc2.error) {
          const raw2 = rpc2.data;
          const row2 = (Array.isArray(raw2) ? raw2[0] : raw2) as StaffRow | null | undefined;
          return { row: row2 ?? null, error: null };
        }
      } else {
        log.warn('authStore', 'get_my_staff_session', rpc.error.message);
      }
    }
    return await fetchStaffRowViaTable(authId);
  } catch (e) {
    const msg = (e as Error)?.message ?? 'staff timeout';
    if (msg.includes('staff_rpc')) {
      try {
        return await fetchStaffRowViaTable(authId);
      } catch (e2) {
        return { row: null, error: (e2 as Error)?.message ?? msg };
      }
    }
    return { row: null, error: msg };
  }
}

function hydrateOrg(staff: StaffProfile): void {
  if (!staff.organization_id) return;
  void supabase
    .from('organizations')
    .select('name, slug, kind')
    .eq('id', staff.organization_id)
    .maybeSingle()
    .then(({ data }) => {
      if (!data?.name) return;
      const s = useAuthStore.getState().staff;
      if (!s || s.id !== staff.id) return;
      useAuthStore.setState({
        staff: {
          ...s,
          organization: {
            name: data.name,
            slug: (data as { slug?: string | null }).slug ?? undefined,
            kind: (data as { kind?: string | null }).kind ?? undefined,
          },
        },
      });
    })
    .catch(() => {});
}

async function resolveStaffForUser(user: User): Promise<StaffResolveResult> {
  const { row, error } = await fetchStaffRow(user.id);

  if (!error && row) {
    const staff = staffFromRow(row);
    if (staff) {
      await writeStaffSessionCache(user.id, staff);
      savePushTokenForStaff(row.id).catch(() => {});
      hydrateOrg(staff);
      return { status: 'staff', staff };
    }
  }

  if (!error && !row) {
    await clearStaffSessionCache();
    return { status: 'guest' };
  }

  if (error) log.warn('authStore', 'staff fetch', isSupabaseUnavailableError(error) ? 'Supabase geçici kapalı (522)' : error);

  const cached = await readStaffSessionCache(user.id);
  if (cached && !cached.deleted_at) {
    log.info('authStore', 'staff önbellek kullanılıyor');
    hydrateOrg(cached);
    return { status: 'staff', staff: cached };
  }

  if (error) return { status: 'unknown', reason: error };
  return { status: 'guest' };
}

function scheduleStaffRetry(user: User, slow = false) {
  if (staffRetryUserId !== user.id) {
    staffFastRetryCount = 0;
    staffRetryUserId = user.id;
  }

  clearStaffRetryTimer();

  if (!slow && staffFastRetryCount >= STAFF_RETRY_FAST_MAX) {
    log.warn('authStore', 'staff hızlı retry bitti, yavaş mod', { attempts: staffFastRetryCount });
    scheduleStaffRetry(user, true);
    return;
  }

  const delay = slow ? STAFF_RETRY_SLOW_MS : [0, 4_000, 10_000][staffFastRetryCount] ?? 10_000;
  if (!slow) staffFastRetryCount += 1;

  staffRetryTimer = setTimeout(() => {
    staffRetryTimer = null;
    void runStaffCheck(user, { background: true });
  }, delay);
}

function applyStaffResolve(user: User, result: StaffResolveResult): void {
  const cur = useAuthStore.getState();
  if (cur.user?.id !== user.id) return;

  if (result.status === 'unknown') {
    const existingStaff = cur.staff?.auth_id === user.id ? cur.staff : null;
    if (existingStaff || cur.staffCheckComplete) {
      useAuthStore.setState({
        user,
        staff: existingStaff ?? cur.staff,
        staffCheckComplete: true,
        staffCheckUnavailable: false,
        loading: false,
      });
      scheduleStaffRetry(user, true);
      return;
    }
    useAuthStore.setState({
      user,
      staffCheckComplete: false,
      staffCheckUnavailable: true,
      loading: false,
    });
    scheduleStaffRetry(user, isSupabaseUnavailableError(result.reason));
    return;
  }

  clearStaffRetryTimer();
  clearStaffBootWatchdog();
  staffFastRetryCount = 0;
  staffRetryUserId = null;
  lastStaffCheckUserId = user.id;

  const staff = result.status === 'staff' ? result.staff : null;
  useAuthStore.setState({
    user,
    staff,
    staffCheckComplete: true,
    staffCheckUnavailable: false,
    loading: false,
  });
  log.info('authStore', 'staffCheckComplete', { hasStaff: !!staff });
}

function resetAuthPipeline(): void {
  loadSessionPromise = null;
  staffCheckPromise = null;
  clearStaffRetryTimer();
  staffFastRetryCount = 0;
  staffRetryUserId = null;
  lastStaffCheckUserId = null;
  clearStaffBootWatchdog();
}

/** Giriş sonrası anında oturum — staff kontrolü arka planda. */
export async function completeSignIn(user: User): Promise<void> {
  const cur = useAuthStore.getState();
  if (cur.user?.id === user.id && cur.staffCheckComplete) {
    void runStaffCheck(user, { background: true });
    return;
  }
  resetAuthPipeline();
  const cached = await readStaffSessionCache(user.id);
  useAuthStore.setState({
    user,
    staff: cached,
    loading: false,
    staffCheckComplete: true,
    staffCheckUnavailable: false,
  });
  void runStaffCheck(user, { background: true });
}

function runStaffCheck(user: User, _opts?: { background?: boolean }): Promise<void> {
  if (staffCheckPromise) return staffCheckPromise;

  staffCheckPromise = (async () => {
    const result = await resolveStaffForUser(user);
    applyStaffResolve(user, result);
  })().finally(() => {
    staffCheckPromise = null;
  });

  return staffCheckPromise;
}

async function doLoadSession(set: (p: Partial<AuthState>) => void, get: () => AuthState): Promise<void> {
  log.info('authStore', 'loadSession başladı');
  try {
    const [{ data: { session }, error: sessionError }, cachePeek] = await Promise.all([
      withTimeout(supabase.auth.getSession(), SESSION_FETCH_TIMEOUT_MS, 'getSession'),
      peekStaffSessionCache(),
    ]);
    if (sessionError) {
      const msg = sessionError.message ?? '';
      if (isSupabaseUnavailableError(msg)) {
        log.warn('authStore', 'getSession — Supabase geçici kapalı (522)');
      } else {
        log.error('authStore', 'getSession hatası', sessionError);
      }
      const cachedUser = get().user;
      set({
        user: cachedUser,
        staff: get().staff,
        loading: false,
        staffCheckComplete: true,
        staffCheckUnavailable: !cachedUser,
      });
      return;
    }

    const user = session?.user ?? null;
    if (!user) {
      clearStaffRetryTimer();
      staffFastRetryCount = 0;
      lastStaffCheckUserId = null;
      set({ user: null, staff: null, loading: false, staffCheckComplete: true, staffCheckUnavailable: false });
      return;
    }

    const cached =
      cachePeek?.auth_id === user.id && !cachePeek.staff.deleted_at ? cachePeek.staff : null;
    const memory = get().staff?.auth_id === user.id ? get().staff : null;
    const staff = cached ?? memory ?? null;

    set({
      user,
      staff,
      loading: false,
      staffCheckComplete: true,
      staffCheckUnavailable: false,
    });
    log.info('authStore', 'loadSession bitti', { hasStaff: !!staff });

    if (lastStaffCheckUserId !== user.id) {
      void runStaffCheck(user, { background: true });
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    log.warn('authStore', 'loadSession', msg);
    if (msg.includes('getSession timed out')) {
      set({ user: null, staff: null, loading: false, staffCheckComplete: true, staffCheckUnavailable: false });
      return;
    }
    const user = get().user;
    if (user && !get().staffCheckComplete) {
      set({ loading: false, staffCheckUnavailable: true });
      void runStaffCheck(user);
    } else {
      set({ loading: false, staffCheckComplete: true, staffCheckUnavailable: false });
    }
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  staff: null,
  /** İlk loadSession bitene kadar lobi yerine boot ekranı (Android boş ekran / flicker önleme). */
  loading: true,
  staffCheckComplete: false,
  staffCheckUnavailable: false,

  setUser: (user) => set({ user }),
  setStaff: (staff) => set({ staff }),

  retryStaffCheck: async () => {
    const { user } = get();
    if (!user) return;
    clearStaffRetryTimer();
    staffFastRetryCount = 0;
    set({ staffCheckUnavailable: false, staffCheckComplete: false, loading: true });
    await runStaffCheck(user);
  },

  waitForStaffCheck: async () => {
    const { user, staffCheckComplete } = get();
    if (staffCheckComplete || !user) return;
    await runStaffCheck(user);
  },

  loadSession: async () => {
    if (loadSessionPromise) return loadSessionPromise;
    loadSessionPromise = doLoadSession(set, get).finally(() => {
      loadSessionPromise = null;
    });
    return loadSessionPromise;
  },

  signOut: async () => {
    log.info('authStore', 'signOut');
    resetAuthPipeline();

    set({ user: null, staff: null, loading: false, staffCheckComplete: true, staffCheckUnavailable: false });

    try {
      await clearGuestMessagingLocalState();
      await clearStaffSessionCache();
      await clearLastRoute();
    } catch (e) {
      log.warn('authStore', 'signOut yerel temizlik', e);
    }

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      log.warn('authStore', 'signOut local scope', e);
    }
  },
}));

export function initAuthListener() {
  void useAuthStore.getState().loadSession();
  return supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      void supabase.auth.getSession().then(({ data: { session: live } }) => {
        if (live?.user) return;
        resetAuthPipeline();
        void clearGuestMessagingLocalState();
        void clearStaffSessionCache();
        useAuthStore.setState({
          user: null,
          staff: null,
          loading: false,
          staffCheckComplete: true,
          staffCheckUnavailable: false,
        });
      });
      return;
    }
    if (event === 'SIGNED_IN' && session?.user) {
      void completeSignIn(session.user);
      return;
    }
    if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
      void useAuthStore.getState().loadSession();
    }
  });
}
