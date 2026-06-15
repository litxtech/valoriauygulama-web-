-- AI Reception: aktif personel doğal dil ile görev oluşturabilir (gorev_ata şart değil).
-- Manuel görev atama RLS (123) admin/gorev_ata ile sınırlı kalır.

CREATE OR REPLACE FUNCTION public.staff_ai_reception_create_assignments(
  p_assignee_staff_ids UUID[],
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_task_type TEXT DEFAULT 'general',
  p_priority TEXT DEFAULT 'normal',
  p_room_ids UUID[] DEFAULT '{}'
)
RETURNS TABLE(id UUID, assigned_staff_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator UUID;
  v_org UUID;
  v_assignee UUID;
  v_row_id UUID;
  v_row_assignee UUID;
  v_task_type TEXT;
  v_priority TEXT;
BEGIN
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'title required';
  END IF;

  v_task_type := COALESCE(NULLIF(btrim(p_task_type), ''), 'general');
  IF v_task_type NOT IN ('reception', 'housekeeping', 'technical', 'security', 'general') THEN
    v_task_type := 'general';
  END IF;

  v_priority := COALESCE(NULLIF(btrim(p_priority), ''), 'normal');
  IF v_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    v_priority := 'normal';
  END IF;

  SELECT s.id, s.organization_id
  INTO v_creator, v_org
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.is_active = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  IF v_creator IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'staff session required';
  END IF;

  IF p_assignee_staff_ids IS NULL OR array_length(p_assignee_staff_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'assignees required';
  END IF;

  FOREACH v_assignee IN ARRAY p_assignee_staff_ids
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = v_assignee
        AND s.organization_id = v_org
        AND s.is_active = true
        AND s.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'invalid assignee';
    END IF;

    INSERT INTO public.staff_assignments (
      title,
      body,
      task_type,
      priority,
      status,
      assigned_staff_id,
      created_by_staff_id,
      room_ids,
      due_at
    ) VALUES (
      btrim(p_title),
      NULLIF(btrim(COALESCE(p_body, '')), ''),
      v_task_type,
      v_priority,
      'pending',
      v_assignee,
      v_creator,
      COALESCE(p_room_ids, '{}'),
      NULL
    )
    RETURNING staff_assignments.id, staff_assignments.assigned_staff_id
    INTO v_row_id, v_row_assignee;

    id := v_row_id;
    assigned_staff_id := v_row_assignee;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.staff_ai_reception_create_assignments(UUID[], TEXT, TEXT, TEXT, TEXT, UUID[]) IS
  'AI Reception: oturum sahibi personel için görev oluşturur (360).';

REVOKE ALL ON FUNCTION public.staff_ai_reception_create_assignments(UUID[], TEXT, TEXT, TEXT, TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_ai_reception_create_assignments(UUID[], TEXT, TEXT, TEXT, TEXT, UUID[]) TO authenticated;
