-- Web menü görünümü: deploy/build olmadan organizations.kitchen_menu_public_theme ile güncellenir

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS kitchen_menu_public_theme jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.kitchen_menu_public_theme IS
  'Dış /menu/{slug} sayfası tema ayarları (renkler, hero metinleri, layout). Anlık yansır.';

CREATE OR REPLACE FUNCTION public.update_kitchen_menu_public_theme(
  p_organization_id uuid,
  p_theme jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  PERFORM public.assert_staff_can_manage_hotel_kitchen_menu(p_organization_id);

  UPDATE public.organizations
  SET kitchen_menu_public_theme = COALESCE(p_theme, '{}'::jsonb)
  WHERE id = p_organization_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_kitchen_menu_public_theme(uuid, jsonb) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'organizations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
  END IF;
END $$;

COMMIT;
