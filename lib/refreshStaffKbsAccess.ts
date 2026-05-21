import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { withTimeout } from '@/lib/supabaseTransientErrors';

/** KBS ekranı açılmadan çağrılmalı — açılışta DB yükü oluşturmaz. */
export async function refreshStaffKbsAccess(): Promise<void> {
  const staff = useAuthStore.getState().staff;
  if (!staff) return;
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('get_my_kbs_access_enabled'),
      8_000,
      'kbs_access'
    );
    if (error || typeof data !== 'boolean') return;
    const cur = useAuthStore.getState().staff;
    if (!cur || cur.id !== staff.id) return;
    useAuthStore.setState({ staff: { ...cur, kbs_access_enabled: data } });
  } catch {
    /* sunucu yavaş — varsayılan true kalır */
  }
}
