-- Online vitrin odasını sil (medya + bookable kapat; mümkünse kaydı kaldır)

CREATE OR REPLACE FUNCTION public.delete_bookable_showcase_room(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room public.rooms%ROWTYPE;
  v_guests INTEGER;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = v_uid AND s.is_active = true
      AND s.role IN ('admin', 'manager', 'reception')
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_room FROM public.rooms WHERE id = p_room_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'room_not_found'; END IF;

  DELETE FROM public.room_images WHERE room_id = p_room_id;

  SELECT count(*)::int INTO v_guests
  FROM public.guests g
  WHERE g.room_id = p_room_id
    AND coalesce(g.status, '') NOT IN ('checked_out', 'cancelled', 'archived');

  -- Aktif misafir yoksa ve vitrin (V…) odasıysa tamamen sil
  IF coalesce(v_guests, 0) = 0 AND v_room.room_number LIKE 'V%' THEN
    BEGIN
      DELETE FROM public.rooms WHERE id = p_room_id;
      RETURN true;
    EXCEPTION WHEN foreign_key_violation THEN
      -- Bağlı kayıt varsa soft-delete
      NULL;
    END;
  END IF;

  UPDATE public.rooms
  SET
    bookable = false,
    status = 'available',
    updated_at = now()
  WHERE id = p_room_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_bookable_showcase_room(UUID) TO authenticated;
