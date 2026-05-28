-- KBS: yazılan oda numarası yoksa ops.rooms'a otomatik ekle.

BEGIN;

CREATE OR REPLACE FUNCTION public.kbs_edge_ensure_room(p_user_id uuid, p_room_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_ctx jsonb;
  v_hotel_id uuid;
  v_num text;
  v_row ops.rooms%ROWTYPE;
BEGIN
  v_ctx := public.kbs_edge_resolve_app_user(p_user_id);
  IF NOT COALESCE((v_ctx->>'ok')::boolean, false) THEN
    RETURN v_ctx;
  END IF;

  v_hotel_id := (v_ctx->'data'->>'hotel_id')::uuid;
  v_num := btrim(COALESCE(p_room_number, ''));
  IF v_num = '' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'BAD_REQUEST', 'message', 'Oda numarası gerekli')
    );
  END IF;

  SELECT * INTO v_row
  FROM ops.rooms r
  WHERE r.hotel_id = v_hotel_id AND btrim(r.room_number::text) = v_num
  LIMIT 1;

  IF v_row.id IS NULL THEN
    INSERT INTO ops.rooms (hotel_id, room_number, is_active)
    VALUES (v_hotel_id, v_num, true)
    ON CONFLICT (hotel_id, room_number)
    DO UPDATE SET is_active = true
    RETURNING * INTO v_row;
  ELSIF NOT v_row.is_active THEN
    UPDATE ops.rooms SET is_active = true WHERE id = v_row.id RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'id', v_row.id,
      'room_number', v_row.room_number,
      'floor', v_row.floor,
      'capacity', v_row.capacity
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kbs_edge_ensure_room(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kbs_edge_ensure_room(uuid, text) TO service_role;

COMMIT;
