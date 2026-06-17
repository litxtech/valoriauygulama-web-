-- Kimlik çekim (id_capture) yetkisi: ops.app_users + guest_documents yazımı.
-- MRZ (kbs_mrz_scan) ile aynı ops erişimi; tam KBS modülü gerekmez.

BEGIN;

CREATE OR REPLACE FUNCTION ops.staff_has_id_capture(p_perms jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (p_perms->>'id_capture') IN ('true', 't', '1', 'TRUE', 'True'),
    (p_perms->'id_capture') = 'true'::jsonb,
    (p_perms->>'kimlik_cekim') IN ('true', 't', '1', 'TRUE', 'True'),
    (p_perms->'kimlik_cekim') = 'true'::jsonb,
    (p_perms->>'kimlik_cekim_sistemi') IN ('true', 't', '1', 'TRUE', 'True'),
    (p_perms->'kimlik_cekim_sistemi') = 'true'::jsonb,
    false
  );
$$;

CREATE OR REPLACE FUNCTION ops.ensure_app_user_for_auth(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_hotel_id uuid;
  v_staff RECORD;
  v_ops_role text;
  v_hotel_code text;
  v_hotel_name text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_ID_REQUIRED';
  END IF;

  SELECT au.hotel_id INTO v_hotel_id
  FROM ops.app_users au
  WHERE au.id = p_user_id;

  IF v_hotel_id IS NOT NULL THEN
    RETURN v_hotel_id;
  END IF;

  SELECT s.full_name, s.role, s.is_active, s.app_permissions, o.slug, o.name
  INTO v_staff
  FROM public.staff s
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE s.auth_id = p_user_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_STAFF_ROW';
  END IF;

  IF v_staff.role IN ('admin', 'manager') THEN
    v_ops_role := CASE WHEN v_staff.role = 'admin' THEN 'admin' ELSE 'manager' END;
  ELSIF ops.staff_has_kbs_mrz_scan(v_staff.app_permissions)
     OR ops.staff_has_id_capture(v_staff.app_permissions) THEN
    v_ops_role := 'receptionist';
  ELSE
    RAISE EXCEPTION 'STAFF_ROLE_NOT_OPS_ELIGIBLE';
  END IF;

  v_hotel_code := CASE v_staff.slug
    WHEN 'valoria' THEN 'valoria-ops'
    WHEN 'bavul-suite' THEN 'bavul-suite-ops'
    WHEN 'bavultur' THEN 'bavultur-ops'
    ELSE v_staff.slug || '-ops'
  END;
  v_hotel_name := v_staff.name || ' (OPS)';

  v_hotel_id := ops.bootstrap_demo_hotel(v_hotel_code, v_hotel_name, '', 101, 8);

  INSERT INTO ops.app_users (id, hotel_id, full_name, role, is_active, kbs_access_enabled)
  VALUES (p_user_id, v_hotel_id, v_staff.full_name, v_ops_role, true, true)
  ON CONFLICT (id) DO UPDATE SET
    hotel_id = EXCLUDED.hotel_id,
    role = EXCLUDED.role,
    is_active = true,
    full_name = COALESCE(EXCLUDED.full_name, ops.app_users.full_name),
    kbs_access_enabled = COALESCE(ops.app_users.kbs_access_enabled, true);

  RETURN v_hotel_id;
END;
$$;

CREATE OR REPLACE FUNCTION ops.caller_can_write_kbs_guest_data()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT COALESCE(
    (
      SELECT
        au.kbs_access_enabled
        AND au.is_active
        AND (
          au.role IN ('admin', 'manager')
          OR EXISTS (
            SELECT 1
            FROM public.staff s
            WHERE s.auth_id = auth.uid()
              AND s.is_active = true
              AND s.deleted_at IS NULL
              AND (
                s.role IN ('admin', 'manager')
                OR ops.staff_has_kbs_mrz_scan(s.app_permissions)
                OR ops.staff_has_id_capture(s.app_permissions)
              )
          )
        )
      FROM ops.app_users au
      WHERE au.id = auth.uid()
      LIMIT 1
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION ops.staff_has_id_capture(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION ops.staff_has_id_capture(jsonb) IS
  'staff.app_permissions: id_capture / kimlik_cekim / kimlik_cekim_sistemi';

COMMENT ON FUNCTION public.ensure_my_ops_app_user() IS
  'Oturum kullanıcısı için ops.app_users yoksa staff kaydından oluşturur (admin/manager, kbs_mrz_scan veya id_capture).';

COMMENT ON FUNCTION ops.ensure_app_user_for_auth(uuid) IS
  'JWT kullanıcısı için ops.app_users oluşturur (admin/manager, kbs_mrz_scan veya id_capture).';

COMMENT ON FUNCTION ops.caller_can_write_kbs_guest_data() IS
  'KBS/MRZ/kimlik çekim: ops.app_users + kbs_access_enabled; admin/manager veya kbs_mrz_scan / id_capture.';

COMMIT;
