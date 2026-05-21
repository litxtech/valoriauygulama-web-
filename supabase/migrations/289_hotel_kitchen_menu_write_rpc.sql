-- Otel mutfağı menüsü: yazma işlemleri SECURITY DEFINER RPC (RLS 42501 önleme)

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_hotel_kitchen_menu_perm_ok(p_perms jsonb, p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_role = 'admin'
    OR COALESCE(p_perms @> '{"otel_mutfak_menu": true}'::jsonb, false)
    OR COALESCE(p_perms->>'otel_mutfak_menu', '') IN ('true', 't', '1', 'True', 'TRUE');
$$;

CREATE OR REPLACE FUNCTION public.assert_staff_can_manage_hotel_kitchen_menu(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_staff_id uuid;
  v_org uuid;
  v_role text;
  v_perms jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum gerekli';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'Organizasyon gerekli';
  END IF;

  SELECT s.id, s.organization_id, s.role, COALESCE(s.app_permissions, '{}'::jsonb)
  INTO v_staff_id, v_org, v_role, v_perms
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND COALESCE(s.is_active, true) = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Personel kaydı bulunamadı';
  END IF;

  IF public.current_user_is_staff_admin() AND v_role = 'admin' THEN
    RETURN v_staff_id;
  END IF;

  IF v_org IS NULL OR v_org IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Bu otel menüsü için yetkiniz yok (personel otel ataması kontrol edin)';
  END IF;

  IF NOT (
    public.current_user_is_staff_admin()
    OR public.staff_hotel_kitchen_menu_perm_ok(v_perms, v_role)
  ) THEN
    RAISE EXCEPTION 'Otel mutfağı menü yetkisi gerekli';
  END IF;

  RETURN v_staff_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hotel_kitchen_menu_item(
  p_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_category_title text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_price numeric DEFAULT NULL,
  p_served_in_hotel_restaurant boolean DEFAULT true,
  p_is_available boolean DEFAULT true,
  p_sort_order int DEFAULT 0,
  p_image_urls text[] DEFAULT '{}'::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_staff_id uuid;
  v_item_id uuid;
  v_cat text;
  v_nm text;
  v_url text;
  v_i int;
BEGIN
  v_staff_id := public.assert_staff_can_manage_hotel_kitchen_menu(p_organization_id);

  v_cat := nullif(trim(COALESCE(p_category_title, '')), '');
  v_nm := nullif(trim(COALESCE(p_name, '')), '');
  IF v_cat IS NULL OR v_nm IS NULL THEN
    RAISE EXCEPTION 'Kategori ve ad zorunlu';
  END IF;
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'Geçersiz fiyat';
  END IF;

  v_item_id := p_id;
  IF v_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.hotel_kitchen_menu_items i
      WHERE i.id = v_item_id AND i.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Ürün bulunamadı';
    END IF;

    UPDATE public.hotel_kitchen_menu_items
    SET
      category_title = v_cat,
      name = v_nm,
      description = nullif(trim(COALESCE(p_description, '')), ''),
      price = p_price,
      served_in_hotel_restaurant = COALESCE(p_served_in_hotel_restaurant, true),
      is_available = COALESCE(p_is_available, true),
      sort_order = COALESCE(p_sort_order, 0),
      updated_at = now()
    WHERE id = v_item_id;
  ELSE
    v_item_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO public.hotel_kitchen_menu_items (
      id,
      organization_id,
      category_title,
      name,
      description,
      price,
      served_in_hotel_restaurant,
      is_available,
      sort_order,
      created_by_staff_id
    ) VALUES (
      v_item_id,
      p_organization_id,
      v_cat,
      v_nm,
      nullif(trim(COALESCE(p_description, '')), ''),
      p_price,
      COALESCE(p_served_in_hotel_restaurant, true),
      COALESCE(p_is_available, true),
      COALESCE(p_sort_order, 0),
      v_staff_id
    );
  END IF;

  DELETE FROM public.hotel_kitchen_menu_images WHERE item_id = v_item_id;

  v_i := 0;
  FOREACH v_url IN ARRAY COALESCE(p_image_urls, '{}'::text[])
  LOOP
    v_url := nullif(trim(v_url), '');
    IF v_url IS NULL THEN
      CONTINUE;
    END IF;
    v_i := v_i + 1;
    IF v_i > 5 THEN
      EXIT;
    END IF;
    INSERT INTO public.hotel_kitchen_menu_images (item_id, image_url, sort_order)
    VALUES (v_item_id, v_url, v_i - 1);
  END LOOP;

  RETURN v_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_hotel_kitchen_menu_item(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT i.organization_id INTO v_org
  FROM public.hotel_kitchen_menu_items i
  WHERE i.id = p_item_id;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Ürün bulunamadı';
  END IF;

  PERFORM public.assert_staff_can_manage_hotel_kitchen_menu(v_org);

  DELETE FROM public.hotel_kitchen_menu_items WHERE id = p_item_id;
END;
$$;

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
      AND p_object_name LIKE ('org/' || s.organization_id::text || '/%')
      AND (
        public.current_user_is_staff_admin()
        OR s.role = 'admin'
        OR public.staff_hotel_kitchen_menu_perm_ok(COALESCE(s.app_permissions, '{}'::jsonb), s.role)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.assert_staff_can_manage_hotel_kitchen_menu(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_hotel_kitchen_menu_item(uuid, uuid, text, text, text, numeric, boolean, boolean, int, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_hotel_kitchen_menu_item(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hotel_kitchen_menu_storage_insert_allowed(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_hotel_kitchen_menu_item(uuid, uuid, text, text, text, numeric, boolean, boolean, int, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_hotel_kitchen_menu_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hotel_kitchen_menu_storage_insert_allowed(text) TO authenticated;

DROP POLICY IF EXISTS hotel_kitchen_menu_storage_insert ON storage.objects;
CREATE POLICY hotel_kitchen_menu_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hotel-kitchen-menu'
    AND public.hotel_kitchen_menu_storage_insert_allowed(name)
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_storage_update ON storage.objects;
CREATE POLICY hotel_kitchen_menu_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hotel-kitchen-menu'
    AND public.hotel_kitchen_menu_storage_insert_allowed(name)
  );

DROP POLICY IF EXISTS hotel_kitchen_menu_storage_delete ON storage.objects;
CREATE POLICY hotel_kitchen_menu_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hotel-kitchen-menu'
    AND public.hotel_kitchen_menu_storage_insert_allowed(name)
  );

COMMENT ON FUNCTION public.upsert_hotel_kitchen_menu_item IS
  'Otel mutfağı menü ürünü ekle/güncelle + görseller (max 5); RLS bypass, yetki RPC içinde.';

COMMIT;
