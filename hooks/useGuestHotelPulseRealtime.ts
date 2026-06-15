import { useEffect, useRef } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { clearGuestHotelPulseCache } from '@/lib/guestHotelPulseLoad';
import { supabase } from '@/lib/supabase';

const DEBOUNCE_MS = 350;

/** Admin nabız kaydı → misafir ekranında anlık yenileme */
export function useGuestHotelPulseRealtime(
  organizationId: string | null | undefined,
  onRefresh: () => void,
  enabled = true
): void {
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !organizationId) return;

    const tick = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        clearGuestHotelPulseCache();
        refreshRef.current();
      }, DEBOUNCE_MS);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = setTimeout(() => {
      channel = supabase
        .channel(`guest-hotel-pulse-${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'hotel_pulse_config',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => tick()
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'hotel_pulse_manual_activities',
            filter: `organization_id=eq.${organizationId}`,
          },
          () => tick()
        )
        .subscribe();
    }, 600);

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
      clearTimeout(timer);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      sub.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (channel) void supabase.removeChannel(channel);
    };
  }, [organizationId, enabled]);
}
