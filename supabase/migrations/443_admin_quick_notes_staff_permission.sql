BEGIN;

-- Not Al: personel not_al izni; admin tüm org notlarını görür, personel yalnızca kendi notlarını.

CREATE OR REPLACE FUNCTION public.staff_can_access_admin_quick_notes()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT
        s.role = 'admin'
        OR (s.app_permissions->>'not_al') IN ('true', 't', '1', 'True', 'TRUE')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.staff_can_access_admin_quick_notes() IS
  'Not Al: admin veya app_permissions.not_al';

DROP POLICY IF EXISTS admin_quick_notes_select ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_select ON public.admin_quick_notes
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_admin_quick_notes()
    AND (
      public.current_user_is_staff_admin()
      OR created_by_staff_id = public.current_staff_id()
    )
  );

DROP POLICY IF EXISTS admin_quick_notes_update ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_update ON public.admin_quick_notes
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_admin_quick_notes()
    AND (
      public.current_user_is_staff_admin()
      OR created_by_staff_id = public.current_staff_id()
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_admin_quick_notes()
    AND (
      public.current_user_is_staff_admin()
      OR created_by_staff_id = public.current_staff_id()
    )
  );

DROP POLICY IF EXISTS admin_quick_notes_delete ON public.admin_quick_notes;
CREATE POLICY admin_quick_notes_delete ON public.admin_quick_notes
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_access_admin_quick_notes()
    AND (
      public.current_user_is_staff_admin()
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
        AND n.organization_id = public.current_staff_organization_id()
        AND public.staff_can_access_admin_quick_notes()
        AND (
          public.current_user_is_staff_admin()
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
        AND n.organization_id = public.current_staff_organization_id()
        AND public.staff_can_access_admin_quick_notes()
        AND (
          public.current_user_is_staff_admin()
          OR n.created_by_staff_id = public.current_staff_id()
        )
    )
  );

COMMIT;
