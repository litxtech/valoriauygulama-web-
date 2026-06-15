import { supabase } from '@/lib/supabase';

export type MapUserLocationRow = {
  user_id: string;
  user_type: 'guest' | 'staff';
  lat: number;
  lng: number;
  display_name?: string | null;
  avatar_url?: string | null;
  updated_at: string;
};

export type MapUserLocationChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  row: MapUserLocationRow | null;
};

/** Harita avatar konumları — postgres_changes ile anlık yenileme. */
export function subscribeMapUserLocations(onChange: (change?: MapUserLocationChange) => void): () => void {
  const channel = supabase
    .channel('map_user_locations_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'map_user_locations' }, (payload) => {
      const eventType = payload.eventType as MapUserLocationChange['eventType'];
      const row = (payload.new ?? payload.old) as MapUserLocationRow | null;
      onChange({ eventType, row });
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
