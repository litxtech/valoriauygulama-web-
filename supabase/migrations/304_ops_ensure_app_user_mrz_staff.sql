-- MRZ/KBS personeli (kbs_mrz_scan) için ops.app_users otomatik oluşturma.
-- auth.users.id = ops.app_users.id; public.staff.auth_id ile eşleşir.

BEGIN;

CREATE OR REPLACE FUNCTION ops.staff_has_kbs_mrz_scan(p_perms jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (p_perms->>'kbs_mrz_scan') IN ('true', 't', '1', 'TRUE', 'True'),
    (p_perms->'kbs_mrz_scan') = 'true'::jsonb,
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
  ELSIF ops.staff_has_kbs_mrz_scan(v_staff.app_permissions) THEN
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

CREATE OR REPLACE FUNCTION public.ensure_my_ops_app_user()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_uid uuid;
  v_hotel_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTH', 'message', 'Oturum yok');
  END IF;

  BEGIN
    v_hotel_id := ops.ensure_app_user_for_auth(v_uid);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN jsonb_build_object('ok', false, 'code', SQLERRM, 'message', SQLERRM);
  END;

  RETURN jsonb_build_object('ok', true, 'hotel_id', v_hotel_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_my_ops_app_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_my_ops_app_user() TO authenticated;
GRANT EXECUTE ON FUNCTION ops.staff_has_kbs_mrz_scan(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.ensure_my_ops_app_user() IS
  'Oturum kullanıcısı için ops.app_users yoksa staff kaydından oluşturur (admin/manager veya kbs_mrz_scan).';

COMMENT ON FUNCTION ops.ensure_app_user_for_auth(uuid) IS
  'JWT kullanıcısı için ops.app_users oluşturur (admin/manager veya kbs_mrz_scan yetkili personel).';

COMMIT;
