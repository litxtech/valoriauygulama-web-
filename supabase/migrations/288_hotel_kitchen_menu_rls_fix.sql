-- Otel mutfağı menüsü: INSERT RLS düzeltmesi (yeni satır / görsel ekleme)

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_has_hotel_kitchen_menu_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        public.current_user_is_staff_admin()
        OR s.role = 'admin'
        OR (s.app_permissions @> '{"otel_mutfak_menu": true}'::jsonb)
        OR (s.app_permissions->>'otel_mutfak_menu') IN ('true', 't', '1', 'True', 'TRUE')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_can_write_hotel_kitchen_menu_for_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT true
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND s.organization_id IS NOT NULL
        AND s.organization_id = p_org_id
        AND public.staff_has_hotel_kitchen_menu_permission()
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.staff_can_write_hotel_kitchen_menu_for_org(uuid) IS
  'Otel mutfağı menüsü yazma: aktif personel, aynı organizasyon, mutfak menü yetkisi.';

DROP POLICY IF EXISTS hotel_kitchen_menu_items_write_staff ON public.hotel_kitchen_menu_items;

DROP POLICY IF EXISTS hotel_kitchen_menu_items_insert_staff ON public.hotel_kitchen_menu_items;
CREATE POLICY hotel_kitchen_menu_items_insert_staff ON public.hotel_kitchen_menu_items
  FOR INSERT TO authenticated
  WITH CHECK (public.staff_can_write_hotel_kitchen_menu_for_org(organization_id));

DROP POLICY IF EXISTS hotel_kitchen_menu_items_update_staff ON public.hotel_kitchen_menu_items;
CREATE POLICY hotel_kitchen_menu_items_update_staff ON public.hotel_kitchen_menu_items
  FOR UPDATE TO authenticated
  USING (public.staff_can_write_hotel_kitchen_menu_for_org(organization_id))
  WITH CHECK (public.staff_can_write_hotel_kitchen_menu_for_org(organization_id));

DROP POLICY IF EXISTS hotel_kitchen_menu_items_delete_staff ON public.hotel_kitchen_menu_items;
CREATE POLICY hotel_kitchen_menu_items_delete_staff ON public.hotel_kitchen_menu_items
  FOR DELETE TO authenticated
  USING (public.staff_can_write_hotel_kitchen_menu_for_org(organization_id));

DROP POLICY IF EXISTS hotel_kitchen_menu_images_write_staff ON public.hotel_kitchen_menu_images;

DROP POLICY IF EXISTS hotel_kitchen_menu_images_insert_staff ON public.hotel_kitchen_menu_images;
CREATE POLICY hotel_kitchen_menu_images_insert_staff ON public.hotel_kitchen_menu_images
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      WHERE i.id = hotel_kitchen_menu_images.item_id
        AND public.staff_can_write_hotel_kitchen_menu_for_org(i.organization_id)
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_images_update_staff ON public.hotel_kitchen_menu_images;
CREATE POLICY hotel_kitchen_menu_images_update_staff ON public.hotel_kitchen_menu_images
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      WHERE i.id = hotel_kitchen_menu_images.item_id
        AND public.staff_can_write_hotel_kitchen_menu_for_org(i.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      WHERE i.id = hotel_kitchen_menu_images.item_id
        AND public.staff_can_write_hotel_kitchen_menu_for_org(i.organization_id)
    )
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_images_delete_staff ON public.hotel_kitchen_menu_images;
CREATE POLICY hotel_kitchen_menu_images_delete_staff ON public.hotel_kitchen_menu_images
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      WHERE i.id = hotel_kitchen_menu_images.item_id
        AND public.staff_can_write_hotel_kitchen_menu_for_org(i.organization_id)
    )
  );

COMMIT;
