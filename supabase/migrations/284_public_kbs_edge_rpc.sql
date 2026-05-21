-- KBS Edge: public RPC (ops şeması PostgREST'te expose edilmese bile çalışır).
-- Edge service_role ile çağırır; içeride ops tablolarına SECURITY DEFINER erişir.

BEGIN;

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

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('hotel_id', v_hotel_id, 'role', v_role, 'is_active', v_active)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kbs_edge_get_kbs_credentials(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_ctx jsonb;
  v_hotel_id uuid;
  v_role text;
  v_row ops.hotel_kbs_credentials%ROWTYPE;
BEGIN
  v_ctx := public.kbs_edge_resolve_app_user(p_user_id);
  IF NOT COALESCE((v_ctx->>'ok')::boolean, false) THEN
    RETURN v_ctx;
  END IF;

  v_hotel_id := (v_ctx->'data'->>'hotel_id')::uuid;
  v_role := v_ctx->'data'->>'role';

  IF v_role NOT IN ('admin', 'manager') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'FORBIDDEN', 'message', 'KBS ayarları: admin veya manager gerekli')
    );
  END IF;

  SELECT * INTO v_row
  FROM ops.hotel_kbs_credentials c
  WHERE c.hotel_id = v_hotel_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'data', null);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'facility_code', v_row.facility_code,
      'username', v_row.username,
      'kullanici_tc', v_row.username,
      'provider_type', v_row.provider_type,
      'is_active', v_row.is_active,
      'last_tested_at', v_row.last_tested_at,
      'updated_at', v_row.updated_at,
      'has_password', (v_row.password_encrypted IS NOT NULL AND length(v_row.password_encrypted::text) > 0)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kbs_edge_upsert_kbs_credentials(
  p_user_id uuid,
  p_facility_code text,
  p_username text,
  p_password_encrypted text,
  p_api_key_encrypted text,
  p_provider_type text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_ctx jsonb;
  v_hotel_id uuid;
  v_role text;
  v_fc text;
  v_tc text;
  v_existing_pw text;
  v_existing_ak text;
  v_pw text;
  v_ak text;
BEGIN
  v_ctx := public.kbs_edge_resolve_app_user(p_user_id);
  IF NOT COALESCE((v_ctx->>'ok')::boolean, false) THEN
    RETURN v_ctx;
  END IF;

  v_hotel_id := (v_ctx->'data'->>'hotel_id')::uuid;
  v_role := v_ctx->'data'->>'role';

  IF v_role <> 'admin' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'FORBIDDEN', 'message', 'KBS otel şifresi yalnızca admin tarafından kaydedilebilir')
    );
  END IF;

  v_fc := trim(replace(p_facility_code, ' ', ''));
  IF v_fc IS NULL OR v_fc !~ '^\d{1,12}$' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION', 'message', 'Tesis kodu yalnızca rakam olmalı')
    );
  END IF;

  v_tc := regexp_replace(COALESCE(p_username, ''), '\D', '', 'g');
  IF length(v_tc) <> 11 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION', 'message', 'Kullanıcı TC tam 11 haneli olmalıdır')
    );
  END IF;

  SELECT c.password_encrypted::text, c.api_key_encrypted::text
  INTO v_existing_pw, v_existing_ak
  FROM ops.hotel_kbs_credentials c
  WHERE c.hotel_id = v_hotel_id;

  v_pw := COALESCE(NULLIF(trim(p_password_encrypted), ''), v_existing_pw);
  IF v_pw IS NULL OR v_pw = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION', 'message', 'İlk kurulumda KBS otel şifresi zorunludur')
    );
  END IF;

  v_ak := v_existing_ak;
  IF p_api_key_encrypted IS NOT NULL AND trim(p_api_key_encrypted) <> '' THEN
    v_ak := trim(p_api_key_encrypted);
  END IF;

  INSERT INTO ops.hotel_kbs_credentials (
    hotel_id,
    facility_code,
    username,
    password_encrypted,
    api_key_encrypted,
    provider_type,
    is_active,
    last_updated_by
  )
  VALUES (
    v_hotel_id,
    v_fc,
    v_tc,
    v_pw,
    v_ak,
    COALESCE(NULLIF(trim(p_provider_type), ''), 'default'),
    COALESCE(p_is_active, true),
    p_user_id
  )
  ON CONFLICT (hotel_id) DO UPDATE SET
    facility_code = EXCLUDED.facility_code,
    username = EXCLUDED.username,
    password_encrypted = EXCLUDED.password_encrypted,
    api_key_encrypted = EXCLUDED.api_key_encrypted,
    provider_type = EXCLUDED.provider_type,
    is_active = EXCLUDED.is_active,
    last_updated_by = EXCLUDED.last_updated_by;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('saved', true));
END;
$$;

REVOKE ALL ON FUNCTION public.kbs_edge_resolve_app_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kbs_edge_get_kbs_credentials(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kbs_edge_upsert_kbs_credentials(uuid, text, text, text, text, text, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.kbs_edge_resolve_app_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.kbs_edge_get_kbs_credentials(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.kbs_edge_upsert_kbs_credentials(uuid, text, text, text, text, text, boolean) TO service_role;

COMMIT;
