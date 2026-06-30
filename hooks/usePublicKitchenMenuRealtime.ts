import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const REALTIME_DELAY_MS = 900;
const DEBOUNCE_MS = 800;

export type PublicMenuLiveEvent = {
  kind: 'item_insert';
};

/**
 * Dış menü: yalnızca yeni ürün (INSERT) eklendiğinde tetiklenir.
 * Güncelleme, görsel, tema veya sekme değişimi sayfayı yenilemez.
 */
export function usePublicKitchenMenuLive(
  organizationId: string | null | undefined,
  onEvent: (event: PublicMenuLiveEvent) => void
): void {
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    const flush = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        eventRef.current({ kind: 'item_insert' });
      }, DEBOUNCE_MS);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const realtimeTimer = setTimeout(() => {
      channel = supabase
        .channel(`public-kitchen-menu-insert-${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'hotel_kitchen_menu_items',
            filter: `organization_id=eq.${organizationId}`,
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

/** @deprecated usePublicKitchenMenuLive */
export function usePublicKitchenMenuRealtime(
  organizationId: string | null | undefined,
  onRefresh: () => void
): void {
  usePublicKitchenMenuLive(organizationId, () => onRefresh());
}
