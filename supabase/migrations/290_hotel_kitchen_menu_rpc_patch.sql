-- 289 sonrası: assert + storage izni sıkılaştırma / gevşetme yamaları

BEGIN;

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
    RAISE EXCEPTION 'Otel mutfağı menü yetkisi gerekli (otel_mutfak_menu)';
  END IF;

  RETURN v_staff_id;
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

COMMIT;
