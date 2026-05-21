-- 297 kısmen uygulanmış ortamlar için idempotent politika düzeltmesi
BEGIN;

DROP POLICY IF EXISTS facility_journal_access_write ON public.facility_journal_record_access;
DROP POLICY IF EXISTS facility_journal_access_insert ON public.facility_journal_record_access;
DROP POLICY IF EXISTS facility_journal_access_update ON public.facility_journal_record_access;
DROP POLICY IF EXISTS facility_journal_access_delete ON public.facility_journal_record_access;

CREATE POLICY facility_journal_access_insert ON public.facility_journal_record_access
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR public.facility_journal_user_owns_record(record_id)
  );

CREATE POLICY facility_journal_access_update ON public.facility_journal_record_access
  FOR UPDATE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR public.facility_journal_user_owns_record(record_id)
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR public.facility_journal_user_owns_record(record_id)
  );

CREATE POLICY facility_journal_access_delete ON public.facility_journal_record_access
  FOR DELETE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR public.facility_journal_user_owns_record(record_id)
  );

DROP POLICY IF EXISTS facility_journal_records_delete_admin ON public.facility_journal_records;
DROP POLICY IF EXISTS facility_journal_records_delete ON public.facility_journal_records;
CREATE POLICY facility_journal_records_delete ON public.facility_journal_records
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR (
        created_by_staff_id = public.current_staff_id()
        AND public.staff_has_facility_journal_permission()
      )
    )
  );

COMMIT;
