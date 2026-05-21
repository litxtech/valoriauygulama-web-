-- KBS oda listesi + oda ataması: VPS (ops-proxy) olmadan Edge → public RPC.

BEGIN;

CREATE OR REPLACE FUNCTION public.kbs_edge_list_rooms(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_ctx jsonb;
  v_hotel_id uuid;
  v_rows jsonb;
BEGIN
  v_ctx := public.kbs_edge_resolve_app_user(p_user_id);
  IF NOT COALESCE((v_ctx->>'ok')::boolean, false) THEN
    RETURN v_ctx;
  END IF;

  v_hotel_id := (v_ctx->'data'->>'hotel_id')::uuid;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'room_number', r.room_number,
        'floor', r.floor,
        'capacity', r.capacity,
        'is_active', r.is_active
      )
      ORDER BY r.room_number
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM ops.rooms r
  WHERE r.hotel_id = v_hotel_id AND r.is_active = true;

  RETURN jsonb_build_object('ok', true, 'data', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.kbs_edge_assign_room(
  p_user_id uuid,
  p_guest_document_id uuid,
  p_room_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_ctx jsonb;
  v_hotel_id uuid;
  v_guest_id uuid;
  v_doc_hotel uuid;
  v_stay_id uuid;
  v_room_id uuid;
  v_stay_status text;
BEGIN
  v_ctx := public.kbs_edge_resolve_app_user(p_user_id);
  IF NOT COALESCE((v_ctx->>'ok')::boolean, false) THEN
    RETURN v_ctx;
  END IF;

  v_hotel_id := (v_ctx->'data'->>'hotel_id')::uuid;

  SELECT d.guest_id, d.hotel_id
  INTO v_guest_id, v_doc_hotel
  FROM ops.guest_documents d
  WHERE d.id = p_guest_document_id;

  IF v_guest_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'Belge kaydı bulunamadı')
    );
  END IF;

  IF v_doc_hotel <> v_hotel_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Otel kapsamı uyuşmuyor')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ops.rooms r
    WHERE r.id = p_room_id AND r.hotel_id = v_hotel_id AND r.is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'NOT_FOUND', 'message', 'KBS odası bulunamadı')
    );
  END IF;

  UPDATE ops.stay_assignments s
  SET room_id = p_room_id, updated_at = now()
  WHERE s.hotel_id = v_hotel_id
    AND s.guest_id = v_guest_id
    AND s.stay_status IN ('assigned', 'checked_in', 'checkout_pending')
  RETURNING s.id, s.room_id, s.stay_status INTO v_stay_id, v_room_id, v_stay_status;

  IF v_stay_id IS NULL THEN
    INSERT INTO ops.stay_assignments (
      hotel_id,
      guest_id,
      room_id,
      stay_status,
      created_by
    )
    VALUES (v_hotel_id, v_guest_id, p_room_id, 'assigned', p_user_id)
    RETURNING id, room_id, stay_status INTO v_stay_id, v_room_id, v_stay_status;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object('id', v_stay_id, 'room_id', p_room_id, 'stay_status', COALESCE(v_stay_status, 'assigned'))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kbs_edge_list_rooms(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kbs_edge_assign_room(uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.kbs_edge_list_rooms(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.kbs_edge_assign_room(uuid, uuid, uuid) TO service_role;

COMMIT;
