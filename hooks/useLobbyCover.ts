import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchLobbyCover,
  LOBBY_COVER_SETTING_KEY,
  parseLobbyCover,
  type LobbyCover,
} from '@/lib/lobbyCover';

/**
 * Lobi kapak medyası — ilk yükleme + app_settings realtime.
 * Null = varsayılan (paketlenmiş) görsel.
 */
export function useLobbyCover(): LobbyCover | null {
  const [cover, setCover] = useState<LobbyCover | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    try {
      const next = await fetchLobbyCover();
      if (mounted.current) setCover(next);
    } catch {
      // Offline / ağ: mevcut veya varsayılan kalsın
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload();

    const channel = supabase
      .channel('lobby-cover-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
          filter: `key=eq.${LOBBY_COVER_SETTING_KEY}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { value?: unknown } | null;
          if (payload.eventType === 'DELETE') {
            setCover(null);
            return;
          }
          setCover(parseLobbyCover(row?.value));
        }
      )
      .subscribe();

    return () => {
      mounted.current = false;
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  return cover;
}
