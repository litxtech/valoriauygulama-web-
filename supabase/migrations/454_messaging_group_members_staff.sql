-- Grup sohbetine üye ekleme / çıkarma (personel admin).

CREATE OR REPLACE FUNCTION public.messaging_assert_staff_group_admin(
  p_conversation_id UUID,
  p_staff_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type TEXT;
  v_name TEXT;
  v_role TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = p_staff_id AND s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT c.type, c.name INTO v_type, v_name
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_type IS DISTINCT FROM 'group' THEN
    RAISE EXCEPTION 'not_a_group';
  END IF;

  IF v_name = 'Tüm Çalışanlar' THEN
    RAISE EXCEPTION 'all_staff_group_locked';
  END IF;

  SELECT s.role INTO v_role FROM public.staff s WHERE s.id = p_staff_id;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = p_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_list_group_members_staff(
  p_conversation_id UUID,
  p_staff_id UUID
)
RETURNS TABLE(
  participant_id UUID,
  participant_type VARCHAR,
  role VARCHAR,
  display_name TEXT,
  avatar TEXT,
  department TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.id = p_staff_id AND s.auth_id = auth.uid() AND s.is_active = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = p_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  RETURN QUERY
  SELECT
    cp.participant_id,
    cp.participant_type::VARCHAR,
    cp.role::VARCHAR,
    COALESCE(s.full_name, 'Personel')::TEXT AS display_name,
    s.profile_image::TEXT AS avatar,
    COALESCE(s.department, '')::TEXT AS department
  FROM public.conversation_participants cp
  JOIN public.staff s ON s.id = cp.participant_id
    AND cp.participant_type IN ('staff', 'admin')
    AND s.deleted_at IS NULL
  WHERE cp.conversation_id = p_conversation_id
    AND cp.left_at IS NULL
  ORDER BY
    CASE WHEN cp.role = 'admin' THEN 0 ELSE 1 END,
    s.full_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_add_group_members_staff(
  p_conversation_id UUID,
  p_staff_id UUID,
  p_member_staff_ids UUID[]
)
RETURNS TABLE(added_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID;
  v_updated INT;
BEGIN
  PERFORM public.messaging_assert_staff_group_admin(p_conversation_id, p_staff_id);

  FOREACH v_member_id IN ARRAY COALESCE(p_member_staff_ids, ARRAY[]::UUID[]) LOOP
    IF v_member_id IS NULL OR v_member_id = p_staff_id THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.id = v_member_id AND s.is_active = true AND s.deleted_at IS NULL
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.conversation_participants cp
    SET left_at = NULL,
        role = COALESCE(cp.role, 'member')
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = v_member_id
      AND cp.participant_type IN ('staff', 'admin');

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
      added_id := v_member_id;
      RETURN NEXT;
      CONTINUE;
    END IF;

    INSERT INTO public.conversation_participants (
      conversation_id, participant_id, participant_type, role
    )
    VALUES (p_conversation_id, v_member_id, 'staff', 'member')
    ON CONFLICT (conversation_id, participant_id, participant_type) DO UPDATE
      SET left_at = NULL;

    added_id := v_member_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.messaging_remove_group_member_staff(
  p_conversation_id UUID,
  p_staff_id UUID,
  p_member_staff_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
BEGIN
  PERFORM public.messaging_assert_staff_group_admin(p_conversation_id, p_staff_id);

  IF p_member_staff_id IS NULL OR p_member_staff_id = p_staff_id THEN
    RAISE EXCEPTION 'cannot_remove_self';
  END IF;

  UPDATE public.conversation_participants cp
  SET left_at = now()
  WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = p_member_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_list_group_members_staff(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_add_group_members_staff(UUID, UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.messaging_remove_group_member_staff(UUID, UUID, UUID) TO authenticated;
