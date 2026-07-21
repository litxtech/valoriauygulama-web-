-- Admin hesap kilidi: giriş / KBS / ops erişimini sunucu tarafında kesin kapat.

BEGIN;

COMMENT ON COLUMN public.staff.account_locked IS
  'Admin kilidi; true ise personel giriş yapamaz, KBS ve diğer sistemlere erişemez';

-- current_staff_id: RLS/RPC'lerde kilitli hesap yok sayılır
CREATE OR REPLACE FUNCTION public.current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND COALESCE(s.account_locked, false) = false
    AND (s.banned_until IS NULL OR s.banned_until <= now())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_staff_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.organization_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND COALESCE(s.account_locked, false) = false
    AND (s.banned_until IS NULL OR s.banned_until <= now())
  LIMIT 1;
$$;

-- KBS bayrağı: kilitli hesapta her zaman false
CREATE OR REPLACE FUNCTION public.get_my_kbs_access_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ops
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.account_locked, false) = true
    ) THEN false
    ELSE COALESCE(
      (SELECT kbs_access_enabled FROM ops.app_users WHERE id = auth.uid()),
      true
    )
  END;
$$;

COMMENT ON FUNCTION public.get_my_kbs_access_enabled() IS
  'ops.app_users.kbs_access_enabled; staff.account_locked ise false';

-- ops.app_users: kilitlenince pasifleştir, kilidi açılınca tekrar aktifleştir
CREATE OR REPLACE FUNCTION public.staff_sync_ops_on_account_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
BEGIN
  IF NEW.auth_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.account_locked IS DISTINCT FROM OLD.account_locked THEN
    IF NEW.account_locked = true THEN
      UPDATE ops.app_users
      SET is_active = false
      WHERE id = NEW.auth_id;
    ELSE
      UPDATE ops.app_users
      SET is_active = true
      WHERE id = NEW.auth_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_sync_ops_on_account_lock ON public.staff;
CREATE TRIGGER trg_staff_sync_ops_on_account_lock
  AFTER UPDATE OF account_locked ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.staff_sync_ops_on_account_lock();

-- Mevcut kilitli hesapları ops'ta pasifleştir
UPDATE ops.app_users au
SET is_active = false
FROM public.staff s
WHERE s.auth_id = au.id
  AND s.account_locked = true
  AND COALESCE(au.is_active, true) = true;

-- ensure_app_user: kilitli personel ops kullanıcısı olamaz / yükseltilemez
CREATE OR REPLACE FUNCTION ops.ensure_app_user_for_auth(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_hotel_id uuid;
  v_ops_role text;
  v_staff RECORD;
  v_hotel_code text;
  v_hotel_name text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_ID_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = p_user_id
      AND COALESCE(s.account_locked, false) = true
  ) THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED';
  END IF;

  SELECT au.hotel_id, au.role
  INTO v_hotel_id, v_ops_role
  FROM ops.app_users au
  WHERE au.id = p_user_id;

  IF v_hotel_id IS NOT NULL THEN
    SELECT s.full_name, s.role
    INTO v_staff
    FROM public.staff s
    WHERE s.auth_id = p_user_id
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND COALESCE(s.account_locked, false) = false
    LIMIT 1;

    IF FOUND AND v_staff.role = 'admin' AND v_ops_role IS DISTINCT FROM 'admin' THEN
      UPDATE ops.app_users
      SET role = 'admin',
          is_active = true,
          full_name = COALESCE(v_staff.full_name, ops.app_users.full_name)
      WHERE id = p_user_id;
    END IF;

    RETURN v_hotel_id;
  END IF;

  SELECT s.full_name, s.role, s.is_active, s.app_permissions, o.slug, o.name
  INTO v_staff
  FROM public.staff s
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE s.auth_id = p_user_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
    AND COALESCE(s.account_locked, false) = false
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

COMMENT ON FUNCTION ops.ensure_app_user_for_auth(uuid) IS
  'JWT kullanıcısı için ops.app_users oluşturur; account_locked veya pasif staff reddedilir.';

-- KBS resolve: kilitli hesapta AUTH hatası
CREATE OR REPLACE FUNCTION public.kbs_edge_resolve_app_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_hotel_id uuid;
  v_role text;
  v_active boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'AUTH', 'message', 'user_id required'));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = p_user_id
      AND COALESCE(s.account_locked, false) = true
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object(
        'code', 'ACCOUNT_LOCKED',
        'message', 'Hesap kilitli; KBS erişimi yok'
      )
    );
  END IF;

  SELECT au.hotel_id, au.role, au.is_active
  INTO v_hotel_id, v_role, v_active
  FROM ops.app_users au
  WHERE au.id = p_user_id;

  IF v_hotel_id IS NULL THEN
    BEGIN
      v_hotel_id := ops.ensure_app_user_for_auth(p_user_id);
    EXCEPTION
      WHEN OTHERS THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', jsonb_build_object('code', 'AUTH', 'message', SQLERRM)
        );
    END;
    SELECT au.hotel_id, au.role, au.is_active
    INTO v_hotel_id, v_role, v_active
    FROM ops.app_users au
    WHERE au.id = p_user_id;
  END IF;

  IF v_hotel_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'AUTH', 'message', 'ops.app_users kaydı oluşturulamadı')
    );
  END IF;

  IF v_active IS DISTINCT FROM true THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'AUTH', 'message', 'ops.app_users pasif')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('hotel_id', v_hotel_id, 'role', v_role, 'is_active', v_active)
  );
END;
$$;

-- App permission helper: kilitli hesap yetkisiz
CREATE OR REPLACE FUNCTION public.staff_has_app_permission(p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (s.app_permissions ->> p_key) = 'true'
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND COALESCE(s.account_locked, false) = false
        AND (s.banned_until IS NULL OR s.banned_until <= now())
      LIMIT 1
    ),
    false
  );
$$;

-- Admin önbelleği: kilitlenince admin_auth_ids'ten düşür
CREATE OR REPLACE FUNCTION public.sync_admin_auth_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.admin_auth_ids WHERE auth_id = OLD.auth_id;
    RETURN OLD;
  END IF;

  IF NEW.auth_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'admin'
     AND COALESCE(NEW.is_active, true)
     AND NEW.deleted_at IS NULL
     AND COALESCE(NEW.account_locked, false) = false
     AND (NEW.banned_until IS NULL OR NEW.banned_until <= now())
  THEN
    INSERT INTO public.admin_auth_ids (auth_id) VALUES (NEW.auth_id)
    ON CONFLICT (auth_id) DO NOTHING;
  ELSE
    DELETE FROM public.admin_auth_ids WHERE auth_id = NEW.auth_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_admin_auth_ids ON public.staff;
CREATE TRIGGER trg_sync_admin_auth_ids
  AFTER INSERT OR UPDATE OF role, is_active, deleted_at, account_locked, banned_until, auth_id
  OR DELETE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_admin_auth_ids();

-- Kilitli adminleri önbellekten temizle
DELETE FROM public.admin_auth_ids a
USING public.staff s
WHERE a.auth_id = s.auth_id
  AND (
    s.role IS DISTINCT FROM 'admin'
    OR COALESCE(s.is_active, true) = false
    OR s.deleted_at IS NOT NULL
    OR COALESCE(s.account_locked, false) = true
    OR (s.banned_until IS NOT NULL AND s.banned_until > now())
  );

COMMIT;
