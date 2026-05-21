-- Dış QR menü: uygulama olmadan /menu/{slug} — anon okuma + realtime

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS public_kitchen_menu_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organizations.public_kitchen_menu_enabled IS
  'true ise /menu/{slug} ile anon menü listesi yayınlanır';

UPDATE public.organizations
SET public_kitchen_menu_enabled = true
WHERE kind = 'hotel' AND public_kitchen_menu_enabled IS NOT TRUE;

-- Organizasyon slug (yalnızca yayın açık oteller)
DROP POLICY IF EXISTS organizations_select_public_kitchen_menu ON public.organizations;
CREATE POLICY organizations_select_public_kitchen_menu ON public.organizations
  FOR SELECT TO anon
  USING (public_kitchen_menu_enabled = true);

-- Yayınlanan menü ürünleri
DROP POLICY IF EXISTS hotel_kitchen_menu_items_select_public ON public.hotel_kitchen_menu_items;
CREATE POLICY hotel_kitchen_menu_items_select_public ON public.hotel_kitchen_menu_items
  FOR SELECT TO anon
  USING (
    is_available = true
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = hotel_kitchen_menu_items.organization_id
        AND o.public_kitchen_menu_enabled = true
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_images_select_public ON public.hotel_kitchen_menu_images;
CREATE POLICY hotel_kitchen_menu_images_select_public ON public.hotel_kitchen_menu_images
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      JOIN public.organizations o ON o.id = i.organization_id
      WHERE i.id = hotel_kitchen_menu_images.item_id
        AND i.is_available = true
        AND o.public_kitchen_menu_enabled = true
    )
  );

-- Realtime (menü ekleme/silme anlık yansır)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'hotel_kitchen_menu_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_kitchen_menu_items;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'hotel_kitchen_menu_images'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_kitchen_menu_images;
  END IF;
END $$;

COMMIT;
