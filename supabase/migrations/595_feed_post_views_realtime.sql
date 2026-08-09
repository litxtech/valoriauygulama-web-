-- Gönderi görüntülemeleri: yazarın cihazında anlık sayaç / liste güncellemesi

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'feed_post_views'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_post_views;
  END IF;
END
$$;

COMMIT;
