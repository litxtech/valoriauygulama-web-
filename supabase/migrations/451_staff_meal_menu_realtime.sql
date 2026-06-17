-- Personel yemek listesi: düzenleme sonrası anlık yansıma (web + mobil)

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'staff_meal_menus'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_meal_menus;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'staff_meal_menu_days'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_meal_menu_days;
  END IF;
END;
$$;

COMMIT;
