import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { clearStaffSessionCache, writeStaffSessionCache } from '@/lib/staffSessionCache';

let staffAccountChannel: RealtimeChannel | null = null;

type StaffStatusRow = {
  account_locked?: boolean | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  is_active?: boolean | null;
  hidden_menu_item_ids?: unknown;
};

/**
 * Personel hesap durumu — admin kilidi, ban ve silme anlık yansır.
 * Kilitlenince oturum kapatılır; KBS/diğer sistemlere erişim kesilir.
 */
export function useStaffAccountStatusRealtime() {
  const staffId = useAuthStore((s) => s.staff?.id);
  const authId = useAuthStore((s) => s.staff?.auth_id);

  useEffect(() => {
    if (staffAccountChannel) {
      void supabase.removeChannel(staffAccountChannel);
      staffAccountChannel = null;
    }
    if (!staffId || !authId) return;

    staffAccountChannel = supabase
      .channel(`staff-account-status-${staffId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'staff', filter: `id=eq.${staffId}` },
        (payload) => {
          const row = payload.new as StaffStatusRow;
          const current = useAuthStore.getState().staff;
          if (!current || current.id !== staffId) return;

          if (row.account_locked === true) {
            void clearStaffSessionCache();
            useAuthStore.setState({ staff: null });
            void useAuthStore.getState().signOut();
            return;
          }

          const banned =
            row.banned_until !== undefined ? row.banned_until : current.banned_until;
          if (banned && new Date(banned) > new Date()) {
            void clearStaffSessionCache();
            useAuthStore.setState({ staff: null });
            void useAuthStore.getState().signOut();
            return;
          }

          if (row.is_active === false || row.deleted_at) {
            void clearStaffSessionCache();
            useAuthStore.setState({ staff: null });
            void useAuthStore.getState().signOut();
            return;
          }

          const next = {
            ...current,
            account_locked: false,
            banned_until: banned,
            deleted_at: row.deleted_at !== undefined ? row.deleted_at : current.deleted_at,
          };
          useAuthStore.setState({ staff: next });
          void writeStaffSessionCache(authId, next);
        }
      )
      .subscribe();

    return () => {
      if (staffAccountChannel) {
        void supabase.removeChannel(staffAccountChannel);
        staffAccountChannel = null;
      }
    };
  }, [staffId, authId]);
}
