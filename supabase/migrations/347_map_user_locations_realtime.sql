-- Admin / harita: misafir ve personel arka plan konum güncellemeleri anlık yansısın
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'map_user_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.map_user_locations;
  END IF;
END $$;

ALTER TABLE public.map_user_locations REPLICA IDENTITY FULL;
