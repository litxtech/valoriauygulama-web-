-- KBS: oda soft-delete (is_active=false). stay_assignments FK kırılmaz.

BEGIN;

CREATE OR REPLACE FUNCTION public.kbs_edge_deactivate_room(p_user_id uuid, p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_ctx jsonb;
  v_hotel_id uuid;
  v_role text;
  v_row ops.rooms%ROWTYPE;
BEGIN
  v_ctx := public.kbs_edge_resolve_app_user(p_user_id);
  IF NOT COALESCE((v_ctx->>'ok')::boolean, false) THEN
    RETURN v_ctx;
  END IF;

  v_hotel_id := (v_ctx->'data'->>'hotel_id')::uuid;
  v_role := v_ctx->'data'->>'role';

  IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'manager' THEN
    -- Valoria staff.admin ops'te receptionist kalmış olabilir; public.staff kontrolü
    IF NOT EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = p_user_id
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND s.role = 'admin'
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Oda silme: admin veya manager gerekli')
      );
    END IF;
  END IF;

  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'BAD_REQUEST', 'message', 'room id gerekli')
    );
  END IF;

  UPDATE ops.rooms
  SET is_active = false
  WHERE id = p_room_id AND hotel_id = v_hotel_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Oda bulunamadı')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('id', v_row.id, 'room_number', v_row.room_number)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kbs_edge_deactivate_room(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kbs_edge_deactivate_room(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.kbs_edge_deactivate_room(uuid, uuid) IS
  'OPS odayı pasifleştirir (is_active=false); Edge kbs-staff-ops için.';

COMMIT;
