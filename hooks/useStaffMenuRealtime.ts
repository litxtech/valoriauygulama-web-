import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { normalizeHiddenMenuItemIds } from '@/lib/staffMenuCatalog';
import { useAuthStore } from '@/stores/authStore';

let staffMenuChannel: RealtimeChannel | null = null;

/**
 * Personel hamburger menüsü — kullanıcı bazlı gizleme anlık yansır.
 */
export function useStaffMenuRealtime() {
  const staffId = useAuthStore((s) => s.staff?.id);

  useEffect(() => {
    if (staffMenuChannel) {
      void supabase.removeChannel(staffMenuChannel);
      staffMenuChannel = null;
    }
    if (!staffId) return;

    staffMenuChannel = supabase
      .channel(`staff-menu-hidden-${staffId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'staff', filter: `id=eq.${staffId}` },
        (payload) => {
          const row = payload.new as { hidden_menu_item_ids?: unknown };
          const hidden = normalizeHiddenMenuItemIds(row.hidden_menu_item_ids);
          const current = useAuthStore.getState().staff;
          if (!current || current.id !== staffId) return;
          useAuthStore.setState({
            staff: { ...current, hidden_menu_item_ids: hidden },
          });
        }
      )
      .subscribe();

    return () => {
      if (staffMenuChannel) {
        void supabase.removeChannel(staffMenuChannel);
        staffMenuChannel = null;
      }
    };
  }, [staffId]);
}
