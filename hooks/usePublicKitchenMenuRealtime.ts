import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/** QR menü sayfası: ürün ekleme/silme/güncelleme anlık yenileme */
export function usePublicKitchenMenuRealtime(
  organizationId: string | null | undefined,
  onRefresh: () => void
): void {
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`public-kitchen-menu-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hotel_kitchen_menu_items',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => onRefresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, onRefresh]);
}
