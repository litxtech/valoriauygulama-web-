-- Misafir nabzı: admin kaydı → anlık güncelleme (Supabase Realtime)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hotel_pulse_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_pulse_config;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hotel_pulse_manual_activities'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_pulse_manual_activities;
  END IF;
END $$;
