-- Bağlantı testi: hotel_id döndür; admin + manager (staff.admin ops’ta manager kalsa da izin).

BEGIN;

CREATE OR REPLACE FUNCTION public.kbs_edge_get_credentials_for_test(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_ctx jsonb;
  v_hotel_id uuid;
  v_role text;
  v_staff_role text;
  v_row ops.hotel_kbs_credentials%ROWTYPE;
BEGIN
  v_ctx := public.kbs_edge_resolve_app_user(p_user_id);
  IF NOT COALESCE((v_ctx->>'ok')::boolean, false) THEN
    RETURN v_ctx;
  END IF;

  v_hotel_id := (v_ctx->'data'->>'hotel_id')::uuid;
  v_role := v_ctx->'data'->>'role';

  SELECT s.role INTO v_staff_role
  FROM public.staff s
  WHERE s.auth_id = p_user_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_role NOT IN ('admin', 'manager') AND COALESCE(v_staff_role, '') <> 'admin' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Bağlantı testi yalnızca admin/manager')
    );
  END IF;

  SELECT * INTO v_row FROM ops.hotel_kbs_credentials c WHERE c.hotel_id = v_hotel_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'KBS kimlik kaydı yok. Önce Kaydet ile şifre girin.')
    );
  END IF;

  IF v_row.password_encrypted IS NULL OR length(v_row.password_encrypted::text) < 10 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION', 'message', 'KBS otel şifresi kayıtlı değil')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'hotel_id', v_hotel_id,
      'facility_code', v_row.facility_code,
      'username', v_row.username,
      'password_encrypted', v_row.password_encrypted::text,
      'is_active', v_row.is_active
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kbs_edge_get_credentials_for_test(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kbs_edge_get_credentials_for_test(uuid) TO service_role;

COMMIT;
