-- Storage yedek: Edge kapalıysa uid/org/... ve org/... yollarına izin + okuma

BEGIN;

CREATE OR REPLACE FUNCTION public.hotel_kitchen_menu_storage_insert_allowed(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND COALESCE(s.is_active, true) = true
      AND s.deleted_at IS NULL
      AND s.organization_id IS NOT NULL
      AND (
        p_object_name LIKE ('org/' || s.organization_id::text || '/%')
        OR p_object_name LIKE (auth.uid()::text || '/org/' || s.organization_id::text || '/%')
      )
      AND (
        public.current_user_is_staff_admin()
        OR s.role = 'admin'
        OR public.staff_hotel_kitchen_menu_perm_ok(COALESCE(s.app_permissions, '{}'::jsonb), s.role)
      )
  );
$$;

DROP POLICY IF EXISTS hotel_kitchen_menu_storage_select ON storage.objects;
CREATE POLICY hotel_kitchen_menu_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'hotel-kitchen-menu');

DROP POLICY IF EXISTS hotel_kitchen_menu_storage_read_anon ON storage.objects;
CREATE POLICY hotel_kitchen_menu_storage_read_anon ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'hotel-kitchen-menu');

COMMIT;
