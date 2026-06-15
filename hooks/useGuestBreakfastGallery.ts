import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { loadGuestBreakfastGallery, type GuestBreakfastGalleryItem } from '@/lib/guestBreakfastGallery';

export function useGuestBreakfastGallery(enabled = true, refreshKey = 0) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [items, setItems] = useState<GuestBreakfastGalleryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const guestRow = await getOrCreateGuestForCurrentSession();
      if (!alive) return;
      if (guestRow?.guest_id) {
        const { data } = await supabase
          .from('guests')
          .select('organization_id')
          .eq('id', guestRow.guest_id)
          .maybeSingle();
        setOrgId((data as { organization_id?: string | null } | null)?.organization_id ?? null);
      } else {
        setOrgId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const rows = await loadGuestBreakfastGallery(orgId);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [enabled, orgId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return { items, loading, reload: load };
}
