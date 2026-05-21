BEGIN;

-- Tesis günlüğü Storage: yükleme yalnızca kendi auth klasörüne (path injection önlemi)
DROP POLICY IF EXISTS facility_journal_storage_insert ON storage.objects;
CREATE POLICY facility_journal_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'facility-journal'
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_facility_journal_permission()
    )
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
