import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { supabase } from '@/lib/supabase';

const POLL_MS = 30_000;
const REALTIME_DELAY_MS = 900;
const DEBOUNCE_MS = 400;

/** Dış menü: Realtime + poll; ilk yükleme bittikten sonra abone olur */
export function usePublicKitchenMenuLive(
  organizationId: string | null | undefined,
  onRefresh: () => void
): void {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    const tick = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        refreshRef.current();
      }, DEBOUNCE_MS);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const realtimeTimer = setTimeout(() => {
      channel = supabase
        .channel(`public-kitchen-menu-${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'hotel_kitchen_menu_items',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => tick()
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'hotel_kitchen_menu_images',
          },
          () => tick()
        )
        .subscribe();
    }, REALTIME_DELAY_MS);

    const poll = setInterval(tick, POLL_MS);

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') tick();
    };
    const sub = AppState.addEventListener('change', onAppState);

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') tick();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      clearTimeout(realtimeTimer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearInterval(poll);
      sub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (channel) void supabase.removeChannel(channel);
    };
  }, [organizationId]);
}

/** @deprecated usePublicKitchenMenuLive */
export function usePublicKitchenMenuRealtime(
  organizationId: string | null | undefined,
  onRefresh: () => void
): void {
  usePublicKitchenMenuLive(organizationId, onRefresh);
}
