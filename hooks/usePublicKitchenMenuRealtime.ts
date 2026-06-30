import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';

const REALTIME_DELAY_MS = 900;
const DEBOUNCE_MS = 600;

export type PublicMenuLiveEvent = {
  kind: 'item_insert' | 'item_update' | 'item_delete' | 'image_change' | 'theme_update';
};

/** Dış menü: yalnızca gerçek değişikliklerde yeniler; sürekli poll yok */
export function usePublicKitchenMenuLive(
  organizationId: string | null | undefined,
  onEvent: (event: PublicMenuLiveEvent) => void
): void {
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKindRef = useRef<PublicMenuLiveEvent['kind'] | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    const flush = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        const kind = pendingKindRef.current ?? 'item_update';
        pendingKindRef.current = null;
        eventRef.current({ kind });
      }, DEBOUNCE_MS);
    };

    const queue = (kind: PublicMenuLiveEvent['kind']) => {
      if (kind === 'item_insert') {
        pendingKindRef.current = 'item_insert';
      } else if (!pendingKindRef.current || pendingKindRef.current !== 'item_insert') {
        pendingKindRef.current = kind;
      }
      flush();
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const realtimeTimer = setTimeout(() => {
      channel = supabase
        .channel(`public-kitchen-menu-${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'hotel_kitchen_menu_items',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => queue('item_insert')
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'hotel_kitchen_menu_items',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => queue('item_update')
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'hotel_kitchen_menu_items',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => queue('item_delete')
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'hotel_kitchen_menu_images',
          },
          () => queue('image_change')
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'organizations',
            filter: `id=eq.${organizationId}`,
          },
          () => queue('theme_update')
        )
        .subscribe();
    }, REALTIME_DELAY_MS);

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') queue('item_update');
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      clearTimeout(realtimeTimer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      sub.remove();
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
