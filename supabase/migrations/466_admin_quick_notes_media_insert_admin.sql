BEGIN;

-- Yönetici başka personelin notuna medya ekleyebilsin (düzenleme).

DROP POLICY IF EXISTS admin_quick_note_media_insert ON public.admin_quick_note_media;
CREATE POLICY admin_quick_note_media_insert ON public.admin_quick_note_media
  FOR INSERT TO authenticated
  WITH CHECK (
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
