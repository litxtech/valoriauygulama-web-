-- Resmi uyarı INSERT/SELECT: admin_auth_ids hesapları UI işletme seçicisiyle
-- farklı organization_id kullanabilsin; issued_by tüm aktif staff satırlarından biri olabilir.

BEGIN;

DROP POLICY IF EXISTS "staff_personnel_warnings_select" ON public.staff_personnel_warnings;
CREATE POLICY "staff_personnel_warnings_select"
  ON public.staff_personnel_warnings FOR SELECT TO authenticated
  USING (
    subject_staff_id = public.current_staff_id()
    OR public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "staff_personnel_warnings_insert_admin" ON public.staff_personnel_warnings;
CREATE POLICY "staff_personnel_warnings_insert_admin"
  ON public.staff_personnel_warnings FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_staff_admin()
    AND issued_by_staff_id IN (
      SELECT s.id
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = subject_staff_id
        AND s.organization_id = organization_id
        AND s.deleted_at IS NULL
    )
  );

COMMIT;
