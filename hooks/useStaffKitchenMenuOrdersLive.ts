import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const REALTIME_DELAY_MS = 600;
const DEBOUNCE_MS = 500;

/** Dijital menü siparişleri — INSERT/UPDATE ile mutfak ekranını yenile. */
export function useStaffKitchenMenuOrdersLive(
  organizationId: string | null | undefined,
  onRefresh: () => void
): void {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    const flush = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        refreshRef.current();
      }, DEBOUNCE_MS);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const realtimeTimer = setTimeout(() => {
      channel = supabase
        .channel(`staff-kitchen-menu-orders-${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'kitchen_menu_orders',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => flush()
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'kitchen_menu_order_items',
          },
          () => flush()
        )
        .subscribe();
    }, REALTIME_DELAY_MS);

    return () => {
      clearTimeout(realtimeTimer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [organizationId]);
}
