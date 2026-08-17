-- Telsiz odasına üye ekleme / çıkarma (oda üyesi veya admin).

BEGIN;

CREATE OR REPLACE FUNCTION public.add_staff_ptt_room_members(p_room_id UUID, p_staff_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := public.current_staff_id();
  v_admin BOOLEAN := false;
  v_member BOOLEAN := false;
  v_count INT := 0;
BEGIN
  IF v_staff IS NULL OR p_room_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = v_staff
      AND s.role = 'admin'
      AND s.is_active = true
      AND s.deleted_at IS NULL
  ) INTO v_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.staff_ptt_room_members m
    WHERE m.room_id = p_room_id AND m.staff_id = v_staff
  ) INTO v_member;

  IF NOT v_admin AND NOT v_member THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_ptt_rooms r
    WHERE r.id = p_room_id AND r.is_active = true
  ) THEN
    RAISE EXCEPTION 'room_missing';
  END IF;

  INSERT INTO public.staff_ptt_room_members (room_id, staff_id)
  SELECT p_room_id, s.id
  FROM public.staff s
  WHERE s.id = ANY (coalesce(p_staff_ids, ARRAY[]::uuid[]))
    AND s.is_active = true
    AND s.deleted_at IS NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_staff_ptt_room_member(p_room_id UUID, p_staff_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff UUID := public.current_staff_id();
  v_admin BOOLEAN := false;
  v_member BOOLEAN := false;
BEGIN
  IF v_staff IS NULL OR p_room_id IS NULL OR p_staff_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = v_staff
      AND s.role = 'admin'
      AND s.is_active = true
      AND s.deleted_at IS NULL
  ) INTO v_admin;

  SELECT EXISTS (
    SELECT 1 FROM public.staff_ptt_room_members m
    WHERE m.room_id = p_room_id AND m.staff_id = v_staff
  ) INTO v_member;

  IF NOT v_admin AND NOT v_member THEN
    RETURN false;
  END IF;

  DELETE FROM public.staff_ptt_room_members
  WHERE room_id = p_room_id AND staff_id = p_staff_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.add_staff_ptt_room_members(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_staff_ptt_room_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_staff_ptt_room_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_staff_ptt_room_member(uuid, uuid) TO authenticated;

COMMIT;
