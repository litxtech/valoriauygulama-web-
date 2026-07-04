BEGIN;

-- Idempotent: 511/512 remote'da uygulanmış olsa bile güncel politika/RPC burada kesinleşir.
-- Personel (not_al) notları yöneticide görünsün.

CREATE OR REPLACE FUNCTION public.staff_can_view_all_admin_quick_notes()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.admin_auth_ids a WHERE a.auth_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.role = 'admin'
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    );
$$;

COMMENT ON FUNCTION public.staff_can_view_all_admin_quick_notes() IS
  'Not Al: admin_auth_ids veya staff.role=admin — personel notlarını da görebilir';

-- Org kapsamı: super-admin (admin_auth_ids) tüm işletmeler; diğer admin kendi org(lar)ı.
CREATE OR REPLACE FUNCTION public.staff_can_see_quick_note_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.admin_auth_ids a WHERE a.auth_id = auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.staff st
      WHERE st.auth_id = auth.uid()
        AND COALESCE(st.is_active, true) = true
        AND st.deleted_at IS NULL
        AND st.organization_id IS NOT NULL
        AND st.organization_id = p_org_id
    );
$$;

DROP POLICY IF EXISTS admin_quick_notes_select ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_select ON public.admin_quick_notes
  FOR SELECT TO authenticated
  USING (
    public.staff_can_access_admin_quick_notes()
    AND public.staff_can_see_quick_note_org(organization_id)
    AND (
      public.staff_can_view_all_admin_quick_notes()
      OR created_by_staff_id = public.current_staff_id()
    )
  );

DROP POLICY IF EXISTS admin_quick_notes_update ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_update ON public.admin_quick_notes
  FOR UPDATE TO authenticated
  USING (
    public.staff_can_access_admin_quick_notes()
    AND public.staff_can_see_quick_note_org(organization_id)
    AND (
      public.staff_can_view_all_admin_quick_notes()
      OR created_by_staff_id = public.current_staff_id()
    )
  )
  WITH CHECK (
    public.staff_can_access_admin_quick_notes()
    AND public.staff_can_see_quick_note_org(organization_id)
    AND (
      public.staff_can_view_all_admin_quick_notes()
      OR created_by_staff_id = public.current_staff_id()
    )
  );

DROP POLICY IF EXISTS admin_quick_notes_delete ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_delete ON public.admin_quick_notes
  FOR DELETE TO authenticated
  USING (
    public.staff_can_access_admin_quick_notes()
    AND public.staff_can_see_quick_note_org(organization_id)
    AND (
      public.staff_can_view_all_admin_quick_notes()
      OR created_by_staff_id = public.current_staff_id()
    )
  );

DROP POLICY IF EXISTS admin_quick_note_media_select ON public.admin_quick_note_media;
CREATE POLICY admin_quick_note_media_select ON public.admin_quick_note_media
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_quick_notes n
      WHERE n.id = note_id
        AND public.staff_can_access_admin_quick_notes()
        AND public.staff_can_see_quick_note_org(n.organization_id)
        AND (
          public.staff_can_view_all_admin_quick_notes()
          OR n.created_by_staff_id = public.current_staff_id()
        )
    )
  );

DROP POLICY IF EXISTS admin_quick_note_media_delete ON public.admin_quick_note_media;
CREATE POLICY admin_quick_note_media_delete ON public.admin_quick_note_media
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_quick_notes n
      WHERE n.id = note_id
        AND public.staff_can_access_admin_quick_notes()
        AND public.staff_can_see_quick_note_org(n.organization_id)
        AND (
          public.staff_can_view_all_admin_quick_notes()
          OR n.created_by_staff_id = public.current_staff_id()
        )
    )
  );

-- SECURITY DEFINER liste: RLS sapmalarını aşar; admin tüm personel notlarını görür.
DROP FUNCTION IF EXISTS public.admin_list_quick_notes(boolean);

CREATE FUNCTION public.admin_list_quick_notes(p_include_archived boolean DEFAULT false)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  note_number text,
  title text,
  body_text text,
  tag text,
  room_label text,
  is_pinned boolean,
  is_archived boolean,
  created_by_staff_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  creator_full_name text,
  creator_role text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_can_access boolean;
  v_can_view_all boolean;
  v_is_super_admin boolean;
BEGIN
  v_staff_id := public.current_staff_id();
  v_can_access := public.staff_can_access_admin_quick_notes();
  v_can_view_all := public.staff_can_view_all_admin_quick_notes();
  v_is_super_admin := EXISTS (SELECT 1 FROM public.admin_auth_ids a WHERE a.auth_id = auth.uid());

  IF v_staff_id IS NULL OR NOT v_can_access THEN
    RAISE EXCEPTION 'Unauthorized: not_al or admin required';
  END IF;

  RETURN QUERY
  SELECT
    n.id,
    n.organization_id,
    n.note_number,
    n.title,
    n.body_text,
    n.tag,
    n.room_label,
    n.is_pinned,
    n.is_archived,
    n.created_by_staff_id,
    n.created_at,
    n.updated_at,
    s.full_name::text AS creator_full_name,
    s.role::text AS creator_role
  FROM public.admin_quick_notes n
  LEFT JOIN public.staff s ON s.id = n.created_by_staff_id
  WHERE (p_include_archived OR n.is_archived = false)
    AND (
      v_is_super_admin
      OR n.organization_id IN (
        SELECT st.organization_id
        FROM public.staff st
        WHERE st.auth_id = auth.uid()
          AND COALESCE(st.is_active, true) = true
          AND st.deleted_at IS NULL
          AND st.organization_id IS NOT NULL
      )
    )
    AND (
      v_can_view_all
      OR n.created_by_staff_id = v_staff_id
    )
  ORDER BY n.is_pinned DESC, n.created_at DESC
  LIMIT 200;
END;
$$;

COMMENT ON FUNCTION public.admin_list_quick_notes(boolean) IS
  'Not Al listesi: admin tüm personel notlarını (org/super-admin kapsamı), personel yalnızca kendi notlarını görür';

GRANT EXECUTE ON FUNCTION public.admin_list_quick_notes(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_quick_notes(boolean) TO service_role;

GRANT EXECUTE ON FUNCTION public.staff_can_view_all_admin_quick_notes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_can_see_quick_note_org(uuid) TO authenticated;

COMMIT;
