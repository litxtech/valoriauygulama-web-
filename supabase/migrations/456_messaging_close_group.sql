-- Grup kapatma: yalnızca admin hesapları erişir; personel anında gruptan çıkarılır.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.staff(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.conversations.closed_at IS 'Grup kapatıldığında set edilir; yalnızca admin personel erişebilir.';
COMMENT ON COLUMN public.conversations.closed_by IS 'Grubu kapatan admin personel.';

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

CREATE OR REPLACE FUNCTION public.messaging_close_group_staff(
  p_conversation_id UUID,
  p_staff_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.messaging_assert_staff_group_admin(p_conversation_id, p_staff_id);

  IF EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id AND c.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'already_closed';
  END IF;

  UPDATE public.conversations
  SET closed_at = now(),
      closed_by = p_staff_id,
      updated_at = now()
  WHERE id = p_conversation_id;

  UPDATE public.conversation_participants cp
  SET left_at = now()
  FROM public.staff s
  WHERE cp.conversation_id = p_conversation_id
    AND cp.participant_id = s.id
    AND cp.participant_type IN ('staff', 'admin')
    AND cp.left_at IS NULL
    AND s.role IS DISTINCT FROM 'admin';

  RETURN TRUE;
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

  IF EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id AND c.closed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'group_closed';
  END IF;

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

DROP POLICY IF EXISTS "messages_staff" ON public.messages;
CREATE POLICY "messages_staff" ON public.messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      JOIN public.staff s ON s.id = cp.participant_id AND cp.participant_type IN ('staff', 'admin')
      WHERE cp.conversation_id = messages.conversation_id
        AND s.auth_id = auth.uid()
        AND cp.left_at IS NULL
    )
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = messages.conversation_id AND c.closed_at IS NOT NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true
      )
    )
  );

GRANT EXECUTE ON FUNCTION public.messaging_close_group_staff(UUID, UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
